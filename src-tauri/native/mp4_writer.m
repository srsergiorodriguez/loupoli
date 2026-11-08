#import <AVFoundation/AVFoundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <dispatch/dispatch.h>
#import <stdlib.h>
#import <string.h>

@interface LoupoliMp4Context : NSObject
@property(nonatomic, strong) AVAssetWriter *writer;
@property(nonatomic, strong) AVAssetWriterInput *input;
@property(nonatomic, strong) AVAssetWriterInputPixelBufferAdaptor *adaptor;
@property(nonatomic, assign) NSInteger width;
@property(nonatomic, assign) NSInteger height;
@property(nonatomic, assign) NSInteger fps;
@property(nonatomic, assign) int64_t frameIndex;
@end

@implementation LoupoliMp4Context
@end

static void set_error(char **out, NSString *message) {
  if (out == NULL) {
    return;
  }
  const char *text = message.UTF8String;
  *out = strdup(text != NULL ? text : "Native MP4 encoding failed.");
}

static void set_ns_error(char **out, NSError *error, NSString *fallback) {
  set_error(out, error.localizedDescription != nil ? error.localizedDescription : fallback);
}

/// Create an AVAssetWriter H.264 session for a stream of JPEG/PNG frames.
void *loupoli_mp4_create(const char *path, int width, int height, int fps, char **error) {
  @autoreleasepool {
    if (path == NULL || width <= 1 || height <= 1 || fps <= 0) {
      set_error(error, @"Invalid MP4 output settings.");
      return NULL;
    }
    // H.264 requires even dimensions.
    if ((width % 2) != 0 || (height % 2) != 0) {
      set_error(error, @"MP4 output width and height must be even.");
      return NULL;
    }
    NSString *nativePath = [NSString stringWithUTF8String:path];
    if (nativePath == nil) {
      set_error(error, @"The MP4 path is not valid UTF-8.");
      return NULL;
    }
    NSURL *url = [NSURL fileURLWithPath:nativePath];
    [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
    NSError *localError = nil;
    AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:url
                                                      fileType:AVFileTypeMPEG4
                                                         error:&localError];
    if (writer == nil) {
      set_ns_error(error, localError, @"The MP4 writer could not be created.");
      return NULL;
    }
    int64_t bitrate = MAX(4000000LL, MIN(20000000LL, (int64_t)width * height * fps / 4));
    NSDictionary *compression = @{
      AVVideoAverageBitRateKey : @(bitrate),
      AVVideoProfileLevelKey : AVVideoProfileLevelH264HighAutoLevel
    };
    NSDictionary *settings = @{
      AVVideoCodecKey : AVVideoCodecTypeH264,
      AVVideoWidthKey : @(width),
      AVVideoHeightKey : @(height),
      AVVideoCompressionPropertiesKey : compression
    };
    AVAssetWriterInput *input =
      [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo
                                          outputSettings:settings];
    input.expectsMediaDataInRealTime = NO;
    NSDictionary *pixelAttributes = @{
      (NSString *)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA),
      (NSString *)kCVPixelBufferWidthKey : @(width),
      (NSString *)kCVPixelBufferHeightKey : @(height),
      (NSString *)kCVPixelBufferCGImageCompatibilityKey : @YES,
      (NSString *)kCVPixelBufferCGBitmapContextCompatibilityKey : @YES
    };
    AVAssetWriterInputPixelBufferAdaptor *adaptor =
      [AVAssetWriterInputPixelBufferAdaptor
        assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input
                                      sourcePixelBufferAttributes:pixelAttributes];
    if (![writer canAddInput:input]) {
      set_error(error, @"AVFoundation rejected the H.264 video input.");
      return NULL;
    }
    [writer addInput:input];
    if (![writer startWriting]) {
      set_ns_error(error, writer.error, @"AVFoundation could not start writing.");
      return NULL;
    }
    [writer startSessionAtSourceTime:kCMTimeZero];
    LoupoliMp4Context *context = [[LoupoliMp4Context alloc] init];
    context.writer = writer;
    context.input = input;
    context.adaptor = adaptor;
    context.width = width;
    context.height = height;
    context.fps = fps;
    context.frameIndex = 0;
    return (__bridge_retained void *)context;
  }
}

/// Append one JPEG/PNG frame encoded by the render canvas.
int loupoli_mp4_append(void *handle, const uint8_t *data, size_t length, char **error) {
  @autoreleasepool {
    if (handle == NULL || data == NULL || length == 0) {
      set_error(error, @"The MP4 frame is empty.");
      return -1;
    }
    LoupoliMp4Context *context = (__bridge LoupoliMp4Context *)handle;
    if (context.writer.status != AVAssetWriterStatusWriting) {
      set_ns_error(error, context.writer.error, @"The MP4 writer is not accepting frames.");
      return -1;
    }
    NSData *frameData = [NSData dataWithBytes:data length:length];
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)frameData, NULL);
    if (source == NULL) {
      set_error(error, @"The MP4 frame could not be decoded.");
      return -1;
    }
    CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
    CFRelease(source);
    if (image == NULL) {
      set_error(error, @"The MP4 frame has no image.");
      return -1;
    }

    CVPixelBufferRef buffer = NULL;
    CVReturn result = kCVReturnError;
    if (context.adaptor.pixelBufferPool != NULL) {
      result = CVPixelBufferPoolCreatePixelBuffer(
        kCFAllocatorDefault, context.adaptor.pixelBufferPool, &buffer);
    } else {
      NSDictionary *attributes = @{
        (NSString *)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA),
        (NSString *)kCVPixelBufferWidthKey : @(context.width),
        (NSString *)kCVPixelBufferHeightKey : @(context.height)
      };
      result = CVPixelBufferCreate(
        kCFAllocatorDefault, context.width, context.height,
        kCVPixelFormatType_32BGRA, (__bridge CFDictionaryRef)attributes, &buffer);
    }
    if (result != kCVReturnSuccess || buffer == NULL) {
      CGImageRelease(image);
      set_error(error, @"The MP4 pixel buffer could not be allocated.");
      return -1;
    }

    CVPixelBufferLockBaseAddress(buffer, 0);
    void *base = CVPixelBufferGetBaseAddress(buffer);
    size_t bytesPerRow = CVPixelBufferGetBytesPerRow(buffer);
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef bitmap = CGBitmapContextCreate(
      base, context.width, context.height, 8, bytesPerRow, colorSpace,
      kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst);
    CGColorSpaceRelease(colorSpace);
    if (bitmap == NULL) {
      CVPixelBufferUnlockBaseAddress(buffer, 0);
      CVPixelBufferRelease(buffer);
      CGImageRelease(image);
      set_error(error, @"The MP4 frame bitmap could not be created.");
      return -1;
    }
    CGRect rect = CGRectMake(0, 0, context.width, context.height);
    CGContextSetRGBFillColor(bitmap, 0, 0, 0, 1);
    CGContextFillRect(bitmap, rect);
    CGContextSetInterpolationQuality(bitmap, kCGInterpolationHigh);
    CGContextDrawImage(bitmap, rect, image);
    CGContextRelease(bitmap);
    CVPixelBufferUnlockBaseAddress(buffer, 0);
    CGImageRelease(image);

    while (!context.input.readyForMoreMediaData &&
           context.writer.status == AVAssetWriterStatusWriting) {
      [NSThread sleepForTimeInterval:0.002];
    }
    if (context.writer.status != AVAssetWriterStatusWriting) {
      CVPixelBufferRelease(buffer);
      set_ns_error(error, context.writer.error, @"The MP4 writer stopped unexpectedly.");
      return -1;
    }
    CMTime time = CMTimeMake(context.frameIndex, (int32_t)context.fps);
    BOOL appended = [context.adaptor appendPixelBuffer:buffer withPresentationTime:time];
    CVPixelBufferRelease(buffer);
    if (!appended) {
      set_ns_error(error, context.writer.error, @"The MP4 frame could not be appended.");
      return -1;
    }
    context.frameIndex += 1;
    return 0;
  }
}

int loupoli_mp4_finish(void *handle, char **error) {
  @autoreleasepool {
    if (handle == NULL) {
      set_error(error, @"The MP4 writer is unavailable.");
      return -1;
    }
    LoupoliMp4Context *context = (__bridge LoupoliMp4Context *)handle;
    if (context.writer.status != AVAssetWriterStatusWriting) {
      set_ns_error(error, context.writer.error, @"The MP4 writer did not finish.");
      return -1;
    }
    [context.input markAsFinished];
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    [context.writer finishWritingWithCompletionHandler:^{
      dispatch_semaphore_signal(semaphore);
    }];
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
    if (context.writer.status != AVAssetWriterStatusCompleted) {
      set_ns_error(error, context.writer.error, @"AVFoundation could not finalize the MP4.");
      return -1;
    }
    return 0;
  }
}

void loupoli_mp4_cancel(void *handle) {
  @autoreleasepool {
    if (handle == NULL) {
      return;
    }
    LoupoliMp4Context *context = (__bridge_transfer LoupoliMp4Context *)handle;
    [context.writer cancelWriting];
    context.writer = nil;
    context.input = nil;
    context.adaptor = nil;
  }
}

void loupoli_mp4_release(void *handle) {
  if (handle == NULL) {
    return;
  }
  @autoreleasepool {
    LoupoliMp4Context *context = (__bridge_transfer LoupoliMp4Context *)handle;
    context.writer = nil;
    context.input = nil;
    context.adaptor = nil;
  }
}

void loupoli_mp4_free_error(char *error) {
  free(error);
}
