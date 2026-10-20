// Tiến trình cha giả lập "app": chạy /usr/bin/security như tiến trình con rồi chờ. BUILD_ID làm hai bản có cdhash khác nhau.
#include <spawn.h>
#include <sys/wait.h>
#include <unistd.h>
#ifndef BUILD_ID
#define BUILD_ID "0"
#endif
static const char *build_id = "parent-" BUILD_ID;
extern char **environ;
int main(int argc, char **argv) {
  (void)argc;
  (void)build_id;
  pid_t pid;
  argv[0] = "/usr/bin/security";
  if (posix_spawn(&pid, "/usr/bin/security", NULL, NULL, argv, environ)) return 127;
  int st = 0;
  waitpid(pid, &st, 0);
  return WIFEXITED(st) ? WEXITSTATUS(st) : 128;
}
