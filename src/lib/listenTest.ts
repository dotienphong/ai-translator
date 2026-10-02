// Bước "Nghe thử" (§4.1 bước 6): việc cần làm khi lệnh `start_listen_test` trả về. Lệnh có thể chờ lâu (đang nạp
// model); người dùng rời bước trong lúc chờ thì phiên vừa bắt đầu phải dừng, nếu không app thu toàn hệ thống mãi
// (N3 của review 03).
export function afterListenTestStart(running: boolean, left: boolean): "play" | "stop" | "none" {
  if (!running) return "none";
  return left ? "stop" : "play";
}
