
const io = require('socket.io-client');
const { desktopCapturer } = require('electron')
const { dialog } = require('electron').remote
const fs = require('fs');
const child_process = require('child_process');
const os = require('os');
const robot = require("robotjs");

const pty = require('node-pty');

const { Terminal } = require('xterm');

require('./css/xterm.css');


let socket = {io: false, tabs: []};
let windowSources = [];
let port = 45645;

function connect(name, ip, password){
  password = password || "";
  name = name || "User";
  ip = ip || "localhost:"+port;

  try{
    socket.io = io.connect(location.protocol+"//"+ip, {
      reconnection: false,
    });
  }
  catch(e){
    console.log("connection failed", e);
    return;
  }

  socket.username = name;

  socket.io.on('connect', function(data){
    console.log("Client: connected to server " + ip);
  });

  socket.io.on('disconnect', function(data){
    console.log("Client: disconnected from server " + ip);
    disconnect();
  });

  socket.io.on("login", function(data){
    initClient();

    for(let i=0; i<data.tabs.length; i++){
      addTab(data.tabs[i]);
    }

    for(let i=0; i<data.msgs.length; i++){
      addMsg(data.msgs[i], false);
    }
  })

  socket.io.on("msg", (data) => {addMsg(data, true)});

  socket.io.on("addTab", addTab)

  socket.io.on("removeTab", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        socket.tabs[i].nav.remove();
        socket.tabs[i].content.remove();
        socket.tabs.splice(i, 1);
        var t = $("#tabs-nav .nav-item");
        if(t.length > 0){
          t.first().tab("show");
        }
      }
    }
  })

  socket.io.on("changeEditor", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        socket.tabs[i].content.find("textarea").val(data.val);
      }
    }
  });

  socket.io.on("openFileRequest", function(data){
    fs.readFile(data.path+"/"+data.file, 'utf8', (err, data2) => {
      if (err){
        console.error(err);
        return;
      }

      socket.io.emit("addEditor", {text: data2, name: data.file});
    });
  });

  socket.io.on("openDirRequest", function(data){
    let p = data.path+"/"+data.file;
    fs.readdir(p, function(err, files){
      let aFiles = [];

      if(err){
        console.error(err);
        return;
      }

      for(let i=0; i<files.length; i++){
        let t = "file";
        if(fs.lstatSync(p+"/"+files[i]).isDirectory()){
          t = "dir";
        }
        aFiles.push({name: files[i], typ: t});
      }

      socket.io.emit("addFileexplorer", {files: aFiles, path: p});
    });
  });

  socket.io.on("remoteAction", function(data){
    switch(data.typ){
      case "mouse" :
        let screenSize = robot.getScreenSize();
        let x = Math.round(data.x * screenSize.width);
        let y = Math.round(data.y * screenSize.height);
        robot.moveMouse(x, y);
        robot.mouseClick();
      break;
      case "keyboard" :
        let mod = [];
        if(data.alt){
          mod.push("alt");
        }
        if(data.cmd){
          mod.push("command");
          mod.push("control");
        }
        if(data.shift){
          mod.push("shift");
        }

        robot.keyTap(data.key, mod);
      break;
    }
  });

  socket.io.on("changeRemotePermission", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){

        if(typeof data.mouse !== "undefined"){
          if(data.mouse){
            socket.tabs[i].content.find(".remote-control-mouse").removeClass("btn-secondary").addClass("btn-primary");
          }
          else{
            socket.tabs[i].content.find(".remote-control-mouse").removeClass("btn-primary").addClass("btn-secondary");
          }
          socket.tabs[i].tab.obj.mouse = data.mouse;
        }

        if(typeof data.keyboard !== "undefined"){
          if(data.keyboard){
            socket.tabs[i].content.find(".remote-control-keyboard").removeClass("btn-secondary").addClass("btn-primary");
          }
          else{
            socket.tabs[i].content.find(".remote-control-keyboard").removeClass("btn-primary").addClass("btn-secondary");
          }
          socket.tabs[i].tab.obj.keyboard = data.mouse;
        }

        if(typeof data.file !== "undefined"){
          if(data.file){
            socket.tabs[i].content.find(".remote-control-file").removeClass("btn-secondary").addClass("btn-primary");
          }
          else{
            socket.tabs[i].content.find(".remote-control-file").removeClass("btn-primary").addClass("btn-secondary");
          }
          socket.tabs[i].tab.obj.file = data.mouse;
        }
      }
    }
  })

  socket.io.on("addCommandRequest", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        socket.tabs[i].process.write(data.command);
      }
    }
  });

  socket.io.on("addCommandResponse", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        socket.tabs[i].terminal.write(data.data);
      }
    }
  });

  socket.io.on("addCommand", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){

      }
    }
  });

  socket.io.on("startCaptureCall", startCaptureCall);

  socket.io.on("updateCaptureCall", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        captureImage(socket.tabs[i].tab.id, socket.tabs[i].track, socket.tabs[i].canvas);
      }
    }
  })

  socket.io.on("updateCapture", function(data){
    let b = new Blob([data.b], {type : 'image/jpeg'});
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        socket.tabs[i].content.find("img").prop("src", URL.createObjectURL(b));
      }
    }
  });

  socket.io.on("startVideoPeer", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){

        let conn = new RTCPeerConnection({
            iceServers: [     // Information about ICE servers - Use your own!
              //{
              //  urls: "stun:stun.l.google.com:19302"
              //}
              {
                urls: "stun:home.datiss.it:45646",
                username: "sharecare",
                credential: "pimmel3"
              },
              {
                urls: "turn:home.datiss.it:45646",
                username: "sharecare",
                credential: "pimmel3"
              }
            ]
        });

        conn.onicecandidate = (event) => {handleICECandidateEvent(socket.tabs[i], data.cid, event)};
        conn.ontrack = (event) => {handleTrackEvent(socket.tabs[i], event)};
        conn.onnegotiationneeded = () => {handleNegotiationNeededEvent(socket.tabs[i], data.cid)};
        conn.onremovetrack = (event) => {handleRemoveTrackEvent(socket.tabs[i], event)};
      //  conn.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
      //  conn.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
      //  conn.onsignalingstatechange = handleSignalingStateChangeEvent;
        socket.tabs[i].connections[data.cid] = conn;
        socket.tabs[i].stream.getTracks().forEach(track => socket.tabs[i].connections[data.cid].addTrack(track, socket.tabs[i].stream));
      }
    }
  });

  socket.io.on("requestVideoPeer", function(data){
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        let conn = new RTCPeerConnection({
            iceServers: [     // Information about ICE servers - Use your own!
              {
                urls: "stun:home.datiss.it:45646",
                username: "sharecare",
                credential: "pimmel3"
              },
              {
                urls: "turn:home.datiss.it:45646",
                username: "sharecare",
                credential: "pimmel3"
              }
            ]
        });

        conn.onicecandidate = (event) => {handleICECandidateEvent(socket.tabs[i], data.cid, event)};;
        conn.ontrack = (event) => {handleTrackEvent(socket.tabs[i], event)};
        conn.onnegotiationneeded = () => {handleNegotiationNeededEvent(socket.tabs[i], data.cid)};
        conn.onremovetrack = (event) => {handleRemoveTrackEvent(socket.tabs[i], event)};
        //  conn.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
        //  conn.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
        //  conn.onsignalingstatechange = handleSignalingStateChangeEvent;
        socket.tabs[i].connections[data.cid] = conn;

        let desc = new RTCSessionDescription(data.sdp);
        conn.setRemoteDescription(desc).then(function(){
          return conn.createAnswer();
        }).then(function(answer){
          return conn.setLocalDescription(answer);
        }).then(function(){
          socket.io.emit("responseVideoPeer", {id: data.id, sid: data.sid, cid: data.cid, sdp: conn.localDescription});
        });
      }
    }
  });

  socket.io.on("responseVideoPeer", function(data){
    console.log("responseVideoPeer");
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        let desc = new RTCSessionDescription(data.sdp);
        socket.tabs[i].connections[data.cid].setRemoteDescription(desc).then(function(){

        })
      }
    }
  });


  socket.io.on("new-ice-candidate", function(data){
    console.log("new-ice-candidate");
    for(let i=0; i<socket.tabs.length; i++){
      if(socket.tabs[i].tab.id == data.id){
        handleNewICECandidateMsg(socket.tabs[i], data);
      }
    }
  })


  socket.io.emit("login", {name: name, password: password});

  return socket;
}

function addMsg(data, not){
  let m = $('<div class="message"><span class="user">'+data.user+':</span><span class="msg">'+data.text+'</span></div>');
  $("#messages").append(m);

  if(not && socket.io.id != data.id){
    if(Notification){
      let myNotification = new Notification('New Message: '+data.user, {
        body: data.text
      })
    }
  }
}

function addTab(data){
  let t = {tab: data};
  socket.tabs.push(t);

  if($("#info").css("display") != "none"){
    $("#info").hide();
    $("#tabs").show();
    $("#tabs .nav").append($("#tabs-add"));
  }

  let nav = $('<a class="nav-item nav-link" id="nav-'+data.id+'-tab" data-toggle="tab" href="#tab-'+data.id+'" role="tab" aria-controls="tab-'+data.id+'" aria-selected="true"></a>');
  let tab = $('<div class="tab-pane fade" id="tab-'+data.id+'" role="tabpanel" aria-labelledby="nav-'+data.id+'-tab"></div>');


  if($("#tabs .nav .nav-item").length == 0){
    nav.addClass("active");
    tab.addClass("show active");
  }

  $("#tabs .nav").append(nav);
  $("#tabs .tab-content").append(tab);

  if(data.obj.id == socket.io.id){
    nav.tab('show');
  }
  else{
    nav.tab();
  }



  t.nav = nav;
  t.content = tab;

  let con;
  switch(data.typ){
    case "editor" :
      nav.html('<i class="fa fa-font mr-1"></i>'+data.obj.name);
      let editor = $('<textarea class="form-control"></textarea>');
      editor.val(data.obj.text);
      editor.on("keyup", function(e){
        let val = $(e.currentTarget).val();
        socket.io.emit("changeEditor", {id: data.id, val: val});
      });
      tab.append(editor);

    break;
    case "capture" :
      nav.html('<i class="fa fa-camera mr-1"></i>Capture');
      tab.html('<img class="img-fluid">');
    break;
    case "remote-rtc" :
      nav.html('<i class="fa fa-desktop mr-1"></i>Remote (RTC)');
      con = $('<video class="remote-video" autoplay></video><div class="remote-controls"></div>');
      initRemoteAction($(con[0]), $(con[1]), nav, data);
      tab.append(con);

      t.connections = {};
      if(data.obj.id == socket.io.id){
        for (const source of windowSources) {
          if (source.id === data.obj.wid) {
            addVideoSource(t, data);
          }
        }
      }
    break;
    case "remote-socket" :
      nav.html('<i class="fa fa-desktop mr-1"></i>Remote (Socket)');
      con = $('<img class="img-fluid"><div class="remote-controls"></div>');
      initRemoteAction($(con[0]), $(con[1]), nav, data);
      tab.append(con);
    break;

    case "file" :
      nav.html('<i class="fa fa-folder mr-1"></i>'+data.obj.path.split("/").reverse()[0]);
      let w = $('<div class="file-explorer"></div>');
      tab.append(w);

      for(let i=0; i<data.obj.files.length; i++){
        let d = $('<div class="file-data"><a href="#">'+data.obj.files[i].name+'</a></div>');
        switch(data.obj.files[i].typ){
          case "file" :
            d.addClass("file-file");
            d.prepend('<i class="fa fa-file mr-2"></i>');
            d.children("a").on("click", function(e){
              let f = $(e.currentTarget).text();
              socket.io.emit("openFileRequest", {id: data.id, sid: data.obj.id, path: data.obj.path, file: f});
            });

            w.append(d);
          break;
          case "dir" :
            d.addClass("file-dir");
            d.prepend('<i class="fa fa-folder mr-2"></i>');
            d.children("a").on("click", function(e){
              let f = $(e.currentTarget).text();
              socket.io.emit("openDirRequest", {id: data.id, sid: data.obj.id, path: data.obj.path, file: f});
            });


            let p = w.find(".file-dir");
            if(p.length > 0){
              p.last().after(d);
            }
            else{
              w.prepend(d);
            }
          break;
        }
      }
    break;

    case "console" :
      nav.html('<i class="fa fa-terminal mr-1"></i>Terminal');
      let ti = $('<div class="terminal-input"><form><input class="form-control" placeholder="Command"></form></div>');
      ti.children("form").submit(function(e){
        e.preventDefault();
        e.stopPropagation();

        let val = ti.find("input").val();
        ti.find("input").val("");

        socket.io.emit("addCommand", {id: data.id, sid: data.obj.id, command: val});
      });
      let tv = $('<div id="terminal" class="terminal-view"></div>');
      tab.append(tv);


      t.terminal = new Terminal();
      t.terminal.open(tv[0]);

      t.terminal.writeln('Welcome to share&care terminal');
      t.terminal.writeln('');
      t.terminal.writeln('');
      t.terminal.write('\r\n$ ');

      t.terminal.prompt = () => {
          t.terminal.write('$ ');
      };

      let c = "";
      t.terminal.onKey(e => {
          const printable = !e.domEvent.altKey && !e.domEvent.altGraphKey && !e.domEvent.ctrlKey && !e.domEvent.metaKey;

          if (e.domEvent.keyCode === 13) {
              for(let i=0; i<c.length; i++){
                t.terminal.write('\b \b');
              }
              socket.io.emit("addCommand", {id: data.id, sid: data.obj.id, command: c+"\r"});
              c = "";
          } else if (e.domEvent.keyCode === 8) {
              if (t.terminal._core.buffer.x > 2) {
                  t.terminal.write('\b \b');
              }
          } else if (printable) {
            c += e.key;

            t.terminal.write(e.key);
          }
      });

      nav.on('shown.bs.tab', function (e) {
        t.terminal.resize(100, Math.floor(tab.height()/17.5));
      })

      if(socket.io.id == data.obj.id){
        let shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

        let ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: process.env.HOME,
          env: process.env
        });

        t.process = ptyProcess;

        ptyProcess.on('data', function (d) {
          socket.io.emit("addCommandResponse", {id: data.id, data: d});
        });
      }
    break;
  }

  let btn = $('<button class="btn btn-sm btn-link"><i class="fa fa-window-close"></i></button>')
  btn.on("click", function(){
    socket.io.emit("removeTab", {id: data.id});
  });
  nav.append(btn);


}

function initRemoteAction(con, wrap, nav, data){
  let conMouse = $('<button title="Mouse control" class="btn btn-sm btn-secondary remote-control-mouse"><i class="fa fa-mouse"></i></button>');
  let conKeyboard = $('<button title="Keyboard control" class="btn btn-sm btn-secondary remote-control-keyboard"><i class="fa fa-keyboard"></i></button>');
  let conFile = $('<button title="File control" class="btn btn-sm btn-secondary remote-control-file"><i class="fa fa-file"></i></button>');

  if(data.obj.mouse){
    conMouse.removeClass("btn-secondary").addClass("btn-primary");
  }

  if(data.obj.keyboard){
    conKeyboard.removeClass("btn-secondary").addClass("btn-primary");
  }

  if(data.obj.file){
    conFile.removeClass("btn-secondary").addClass("btn-primary");
  }

  if(socket.io.id == data.obj.id){
      conMouse.on("click", function(e){
        socket.io.emit("changeRemotePermission", {id: data.id, mouse: $(e.currentTarget).hasClass("btn-secondary")});
      });

      conKeyboard.on("click", function(e){
        socket.io.emit("changeRemotePermission", {id: data.id, keyboard: $(e.currentTarget).hasClass("btn-secondary")});
      });

      conFile.on("click", function(e){
        socket.io.emit("changeRemotePermission", {id: data.id, file: $(e.currentTarget).hasClass("btn-secondary")});
      });
  }
  else{
    con.on("click", function(e){
      if(!data.obj.mouse){
        return;
      }

      let offset = con.offset();
      let percX = (e.clientX-offset.left) / con.width();
      let percY = (e.clientY-offset.top) / con.height();
      socket.io.emit("remoteAction", {id: data.id, typ: "mouse", x: percX, y: percY});
    });

    document.addEventListener("keyup", function(e){
      if(!data.obj.keyboard){
        return;
      }

      if(document.activeElement.tagName == "BODY" && nav.hasClass("active")){
        socket.io.emit("remoteAction", {id: data.id, typ: "keyboard", which: e.which, key: e.key});
      }
    })
  }

  wrap.append(conMouse, conKeyboard, conFile);
}

async function addVideoSource(tab, data){
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: data.obj.wid,
          minWidth: 1280,
          maxWidth: 1280,
          minHeight: 720,
          maxHeight: 720
        }
      }
    })



    tab.stream = stream;
    tab.content.find("video")[0].srcObject = tab.stream;
  } catch (e) {
    console.error(e);
  }
}

async function startCaptureCall(data){
  console.log("client: startCaptureCall", data);

  for (const source of windowSources) {
    if (source.id === data.id) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1280,
              minHeight: 720,
              maxHeight: 720
            }
          }
        })


        const canvas = document.createElement('canvas');
        canvas.id = "captureCanvas";

        for(let i=0; i<socket.tabs.length; i++){
          if(socket.tabs[i].tab.id == data.tab.id){
            socket.tabs[i].track = stream;
            socket.tabs[i].canvas = canvas;
            socket.tabs[i].wid = data.id;

            captureImage(socket.tabs[i].tab.id, socket.tabs[i].track, socket.tabs[i].canvas);
          }
        }


/*

          let options = { mimeType: "video/webm; codecs=vp9" };
          let mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorder.ondataavailable = function(data){
            console.log(data);
          };
          mediaRecorder.start();
          setTimeout(function(){mediaRecorder.stop();}, 5000);
*/
        //  $("#localvideo")[0].srcObject = stream;
      } catch (e) {
        console.error(e);
      }
      return
    }
  }

}

function captureImage(id, stream, canvas){
  const track = stream.getVideoTracks()[0];

  let imageCapture = new ImageCapture(track);
  let b = imageCapture.grabFrame();
  b.then(function(img){
     // resize it to the size of our ImageBitmap
     canvas.width = img.width;
     canvas.height = img.height;
     // try to get a bitmaprenderer context
     let ctx = false; //canvas.getContext('bitmaprenderer');
     if(ctx) {
       // transfer the ImageBitmap to it
       ctx.transferFromImageBitmap(img);

     }
     else {
       // in case someone supports createImageBitmap only
       // twice in memory...
       ctx = canvas.getContext('2d');
       ctx.drawImage(img,0,0);
     }

     // get it back as a Blob
     canvas.toBlob(function(blob){
       socket.io.emit("updateCapture", {id: id, b: blob});
     }, 'image/jpeg', 0.9);

  }).catch(function(err){
    setTimeout(function(){
      for(let i=0; i<socket.tabs.length; i++){
        if(socket.tabs[i].tab.id == id){
          startCaptureCall({id: socket.tabs[i].wid, tab: socket.tabs[i].tab});
        }
      }
    }, 100);

    console.error("captureImage", err, arguments);
  })
}

function initClient(){
  $("#login").hide(500);

  $("#messages").html("");

  $("#message-new").submit(function(e){
    e.preventDefault();

    let text = $("#message-new-text").val().trim();

    if(text.length == 0){
      return;
    }

    socket.io.emit("msg", {id: socket.io.id, user: socket.username, text: text});

    $("#message-new-text").val("").focus();
  });

  $("#message-new-text").off("keyup").on("keyup", function(e){
    switch(e.which){
      case 13 :
        $("#message-new").submit();
        e.preventDefault();
        e.stopPropagation();
      break;
    }
  })


  $("#window-editor-add").off("click").on("click", function(e){
    socket.io.emit("addEditor");
  });


  desktopCapturer.getSources({ types: ['window', 'screen'] }).then(async sources => {
    windowSources = sources;
    let btn;
    let cap = $('<li class="dropdown-item dropdown-submenu"><span><i class="fa fa-camera mr-1"></i>Capture Windows</span><ul class="dropdown-menu"></ul></li>');
    let drop = cap.find(".dropdown-menu");

    btn = $('<button class="dropdown-item window-source" type="button"><i class="fa fa-file mr-1"></i>File explorer</button>');
    btn.on("click", openFileExplorer);
    $("#tabs-add .dropdown-menu:first").prepend(btn);

    btn = $('<button class="dropdown-item window-console" type="button"><i class="fa fa-terminal mr-1"></i>Terminal</button>');
    btn.on("click", function(e){
      socket.io.emit("addConsole");
    });
    $("#tabs-add .dropdown-menu:first").prepend(btn);

    cap.find("span:first").on("click", function(e){
      $(this).next('ul').toggle();
      e.stopPropagation();
      e.preventDefault();
    });
    $('#tabs-add').on('hide.bs.dropdown', function () {
      $("#tabs-add .dropdown-menu:first").find("ul").hide();
    })

    $("#tabs-add .dropdown-menu:first").prepend(cap);

    let mwid = false;
    for(const s of windowSources){
      if(s.name == "Entire screen"){
        mwid = s.id;
      }

      let id = s.id;
      let btn = $('<button class="dropdown-item window-source" type="button">Capture '+s.name+'</button>');
      btn.on("click", function(e){
        socket.io.emit("addCapture", {id: id});
      });
      drop.append(btn);
    }

    if(mwid !== false){
      let btn = $('<button class="dropdown-item window-remote" type="button"><i class="fa fa-desktop mr-1"></i>Remote control (Websockets)</button>');
      btn.on("click", function(e){
        socket.io.emit("addRemoteSocket", {id: mwid, mouse: true, keyboard: true, file: false});
      });
      $("#tabs-add .dropdown-menu:first").prepend(btn);

      btn = $('<button class="dropdown-item window-remote" type="button"><i class="fa fa-desktop mr-1"></i>Remote control (WebRTC)</button>');
      btn.on("click", function(e){
        socket.io.emit("addRemoteRTC", {id: mwid, mouse: true, keyboard: true, file: false});
      });
      $("#tabs-add .dropdown-menu:first").prepend(btn);
    }
  });
}

function openFileExplorer(e){
  let opt = {
    properties: ["openDirectory"],
  }
  dialog.showOpenDialog(opt, function(paths){
    if(paths && paths.length > 0){
      fs.readdir(paths[0], function(err, files){
        let aFiles = [];

        if(err){
          console.error(err);
          return;
        }

        for(let i=0; i<files.length; i++){
          let t = "file";
          if(fs.lstatSync(paths[0]+"/"+files[i]).isDirectory()){
            t = "dir";
          }
          aFiles.push({name: files[i], typ: t});
        }

        socket.io.emit("addFileexplorer", {files: aFiles, path: paths[0]});
      });
    }
  });
}

function handleNegotiationNeededEvent(tab, cid) {
  tab.connections[cid].createOffer().then(function(offer) {
    return tab.connections[cid].setLocalDescription(offer);
  })
  .then(function() {
    socket.io.emit("requestVideoPeer", {id: tab.tab.id, sid: socket.io.id, cid: cid, sdp: tab.connections[cid].localDescription})
  })
  .catch(function(err){
    console.error(err);
  });
}

function handleICECandidateEvent(tab, cid, event) {
  if (event.candidate) {
    socket.io.emit("new-ice-candidate", {id: tab.tab.id, sid: tab.tab.obj.id, cid: cid, candidate: event.candidate})
  }
}

function handleNewICECandidateMsg(tab, data) {
  var candidate = new RTCIceCandidate(data.candidate);
  tab.connections[data.cid].addIceCandidate(candidate).catch((err) => {console.error(err);});
}

function handleTrackEvent(tab, event) {
  tab.content.find("video")[0].srcObject = event.streams[0];
}

function handleRemoveTrackEvent(tab, event) {

}


function disconnect(){
  $("#login").show(500);
  $("#message-new-text").off("keyup");
  $("#window-editor-add").off("click");
  $("#tabs-add .dropdown-menu .window-source").remove();
  $("#login-host, #login-join").prop("disabled", false);
}

module.exports = {
  connect: connect,
}
