; Optional removal of per-user data. The app stores settings, chats,
; memory, and imported packs under %APPDATA%\desktop-pet.
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除本机的设置、聊天记录、记忆和导入的角色包？$\r$\n位置：%APPDATA%\desktop-pet$\r$\n选择「否」会保留这些数据。" /SD IDNO IDYES doDelete IDNO noDelete
  doDelete:
    RMDir /r "$APPDATA\desktop-pet"
    Goto doneDelete
  noDelete:
  doneDelete:
!macroend
