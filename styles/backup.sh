BACKUPFILE=../backup/messenger-javascript-$(date +%d%b%y-%H%M).bz2
tar --exclude='./backup.sh' --exclude='./closurecheck.sh' --exclude='./serve' -jcvf $BACKUPFILE .

