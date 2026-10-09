// Bộ thử Keychain: mô phỏng đúng API cũ mà keyring (apple-native-keyring-store) dùng.
//   kc write <svc> <acct> <secret>      tạo mục (ACL mặc định: app tạo ra được tin)
//   kc writeany <svc> <acct> <secret>   tạo mục cho mọi app (SecAccess không giới hạn)
//   kc read <svc> <acct>                đọc, KHÔNG cho hiện hộp thoại: lỗi -25308 nghĩa là sẽ hỏi người dùng
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
