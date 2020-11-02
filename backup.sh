BACKUPFILE=../popup-shared-$(date +%d%b%y-%H%M).bz2
tar --exclude='.git' --exclude='./backup.sh' -jcvf $BACKUPFILE .  

