// Bộ thử Keychain: mô phỏng đúng API cũ mà keyring (apple-native-keyring-store) dùng.
// Khác bản của bench/2026-10-09-keychain-prompts: TẮT hộp thoại ở mọi chế độ (không lệnh nào có thể bật hộp thoại trên màn
// hình người dùng), và thêm chế độ `search`. -25293 hay -25308 nghĩa là macOS SẼ HỎI người dùng; 0 là không hỏi.
//   kc write <svc> <acct> <secret>      tạo mục (ACL mặc định: app tạo ra được tin)
//   kc writeany <svc> <acct> <secret>   tạo mục cho mọi app (SecAccess không giới hạn)
//   kc read <svc> <acct>                đọc bí mật
//   kc search <svc> x                   liệt kê thuộc tính của mọi mục có service này (như `search` của keyring-core), không đọc bí mật
//   kc delete <svc> <acct>              xóa
#include <Security/Security.h>
#include <stdio.h>
#include <string.h>
#ifndef BUILD_ID
#define BUILD_ID "0"
#endif
static const char *build_id = "build-" BUILD_ID;
int main(int argc, char **argv) {
  if (argc < 4) { puts(build_id); return 2; }
  const char *mode = argv[1], *svc = argv[2], *acct = argv[3];
  OSStatus st;
  SecKeychainSetUserInteractionAllowed(FALSE);
  if (!strcmp(mode, "write") || !strcmp(mode, "writeany")) {
    const char *secret = argc > 4 ? argv[4] : "x";
    if (!strcmp(mode, "writeany")) {
      SecAccessRef access = NULL;
      st = SecAccessCreate(CFSTR("kc test"), NULL, &access);
      if (st) { printf("SecAccessCreate=%d\n", (int)st); return 1; }
      SecKeychainAttribute attrs[2] = {
        {kSecServiceItemAttr, (UInt32)strlen(svc), (void *)svc}, {kSecAccountItemAttr, (UInt32)strlen(acct), (void *)acct}};
      SecKeychainAttributeList list = {2, attrs};
      st = SecKeychainItemCreateFromContent(kSecGenericPasswordItemClass, &list, (UInt32)strlen(secret), secret, NULL, access, NULL);
    } else {
      st = SecKeychainAddGenericPassword(NULL, (UInt32)strlen(svc), svc, (UInt32)strlen(acct), acct, (UInt32)strlen(secret), secret, NULL);
    }
    printf("write status=%d\n", (int)st);
    return st ? 1 : 0;
  }
  if (!strcmp(mode, "search")) {
    // Liệt kê thuộc tính của mọi mục generic password có service này (như `search` của keyring-core), KHÔNG đọc bí mật.
    CFStringRef cfsvc = CFStringCreateWithCString(NULL, svc, kCFStringEncodingUTF8);
    const void *keys[] = {kSecClass, kSecAttrService, kSecMatchLimit, kSecReturnAttributes};
    const void *vals[] = {kSecClassGenericPassword, cfsvc, kSecMatchLimitAll, kCFBooleanTrue};
    CFDictionaryRef q = CFDictionaryCreate(NULL, keys, vals, 4, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFTypeRef res = NULL;
    st = SecItemCopyMatching(q, &res);
    long n = (st == 0 && res) ? (long)CFArrayGetCount((CFArrayRef)res) : 0;
    printf("search status=%d mục=%ld (%s)\n", (int)st, n, st == 0 ? "OK, không hỏi" : st == -25300 ? "không có mục" : (st == -25308 || st == -25293) ? "SẼ HỎI người dùng" : "lỗi khác");
    return st ? 1 : 0;
  }
  if (!strcmp(mode, "delete")) {
    SecKeychainItemRef item = NULL;
    st = SecKeychainFindGenericPassword(NULL, (UInt32)strlen(svc), svc, (UInt32)strlen(acct), acct, NULL, NULL, &item);
    if (!st) st = SecKeychainItemDelete(item);
    printf("delete status=%d\n", (int)st);
    return st ? 1 : 0;
  }
  SecKeychainSetUserInteractionAllowed(FALSE);
  UInt32 len = 0; void *data = NULL;
  st = SecKeychainFindGenericPassword(NULL, (UInt32)strlen(svc), svc, (UInt32)strlen(acct), acct, &len, &data, NULL);
  printf("read status=%d (%s)\n", (int)st, st == 0 ? "OK, không hỏi" : (st == -25308 || st == -25293) ? "SẼ HỎI người dùng" : "lỗi khác");
  return st ? 1 : 0;
}
