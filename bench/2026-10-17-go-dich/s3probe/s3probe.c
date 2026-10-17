// Dò quyền Trợ năng của một bản ký ad-hoc (spike S3 của Gõ dịch). Không làm gì khác: in version và trusted.
//   s3probe           in một dòng rồi thoát
//   s3probe prompt    xin quyền (hiện hộp thoại hệ thống) rồi theo dõi mỗi giây, in dòng mỗi khi trusted đổi, tối đa 600 giây
//   s3probe watch     chỉ theo dõi như trên, không xin quyền
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <stdlib.h>
#include <dispatch/dispatch.h>
#ifndef PROBE_VERSION
#define PROBE_VERSION "v1"
#endif
static int trusted(int prompt) {
  const void *keys[] = {kAXTrustedCheckOptionPrompt};
  const void *vals[] = {prompt ? kCFBooleanTrue : kCFBooleanFalse};
  CFDictionaryRef opts = CFDictionaryCreate(NULL, keys, vals, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  int t = AXIsProcessTrustedWithOptions(opts) ? 1 : 0;
  CFRelease(opts);
  return t;
}
// Hai cách đọc: `AXIsProcessTrusted()` (app thật dùng) và `AXIsProcessTrustedWithOptions` không xin quyền.
static void line(int plain, int opts) {
  time_t now = time(NULL);
  char buf[16];
  strftime(buf, sizeof buf, "%H:%M:%S", localtime(&now));
  printf("%s version=%s plain=%d opts=%d\n", buf, PROBE_VERSION, plain, opts);
  fflush(stdout);
}
int main(int argc, char **argv) {
  int mode = argc > 1 ? (strcmp(argv[1], "prompt") == 0 ? 2 : strcmp(argv[1], "watch") == 0 ? 1 : 0) : 0;
  int o = trusted(mode == 2);
  int p = AXIsProcessTrusted() ? 1 : 0;
  line(p, o);
  if (mode == 0) return 0;
  // Có run loop như app thật: timer trên main queue mỗi giây, `dispatch_main()` chạy run loop chính.
  __block int bo = o, bp = p, ticks = 0;
  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
  dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), NSEC_PER_SEC, 0);
  dispatch_source_set_event_handler(timer, ^{
    int o2 = trusted(0);
    int p2 = AXIsProcessTrusted() ? 1 : 0;
    if (o2 != bo || p2 != bp) { bo = o2; bp = p2; line(bp, bo); }
    if (++ticks >= 900) exit(0);
  });
  dispatch_resume(timer);
  dispatch_main();
  return 0;
}
