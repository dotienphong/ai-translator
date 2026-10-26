#!/bin/sh
# q.sh <guest> <js>: chạy JS trong trang khách, in kết quả
B=http://127.0.0.1:8765
E=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$2")
curl -s "$B/eval?g=$1&js=$E"; echo
