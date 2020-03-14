const Turn = require('node-turn');

let io, server = {io: false, tabs: [], password: ""};
let msgs = [];

function start(port, password){
  password = password || "";
  server.password = password;

  startTurn();

  io = require('socket.io')(port);


  server.io = io.on('connection', function(socket){
    socket.on('login', function(data){

      if(server.password.length > 0){
        if(server.password != data.password){
          console.log("Wrong login attempt:", data);
          socket.disconnect();
          return;
        }
      }

      let m = {user: "System", text: data.name + " ist beigetreten."};
      msgs.push(m);
      socket.broadcast.emit("msg", m);

      socket.emit("login", {tabs: server.tabs, msgs: msgs});
      socket.username = data.name;

      for(let i=0; i<server.tabs.length; i++){
        if(server.tabs[i].typ != "remote-rtc"){
          continue;
        }

        if(server.tabs[i].obj.id != socket.id){
          io.to(`${server.tabs[i].obj.id}`).emit("startVideoPeer", {id: server.tabs[i].id, cid: socket.id});
        }
      }

      initServerSocket(socket);
    });
  });

  console.log("server listen on port " + port);
}

function initServerSocket(socket){
  console.log("server: client connected");

  socket.on('disconnect', function () {
    console.log("server: client disconnected");

    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].typ != "editor"){
        if(server.tabs[i].obj.id == socket.id){
          io.emit("removeTab", {id: server.tabs[i].id});
          server.tabs.splice(i,1);
        }
      }
    }

    let m = {user: "System", text: socket.username + " ist verschwunden."};
    msgs.push(m);
    socket.broadcast.emit("msg", m);
  });

  socket.on("msg", function(data){
    msgs.push(data);
    io.emit("msg", data);
  });

  socket.on("addEditor", function(data){
    data = data || {};

    let id = getTabId();

    let t = "";
    if(data.text){
      t = data.text;
    }

    let n = "Editor";
    if(data.name){
      n = data.name;
    }
    console.log(data);
    let editor = {text: t, typ: "html", name: n};
    let tab = {id: id, typ: "editor", obj: editor};

    server.tabs.push(tab);

    io.emit("addTab", tab);
  });



  socket.on("addCapture", function(data){
    let id = getTabId();
    let editor = {id: socket.id};
    let tab = {id: id, typ: "capture", obj: editor};

    server.tabs.push(tab);

    io.emit("addTab", tab);
    socket.emit("startCaptureCall", {id: data.id, tab: tab});
  });

  socket.on("addRemoteSocket", function(data){
    let id = getTabId();
    let editor = {id: socket.id, mouse: data.mouse, keyboard: data.keyboard, file: data.file};
    let tab = {id: id, typ: "remote-socket", obj: editor};

    server.tabs.push(tab);

    io.emit("addTab", tab);
    socket.emit("startCaptureCall", {id: data.id, tab: tab});
  });

  socket.on("addRemoteRTC", function(data){
    let id = getTabId();
    let editor = {id: socket.id, wid: data.id, mouse: data.mouse, keyboard: data.keyboard, file: data.file};
    let tab = {id: id, typ: "remote-rtc", obj: editor};

    server.tabs.push(tab);

    io.emit("addTab", tab);
    setTimeout(() => {
      for(let cid in io.sockets.sockets){
        if(cid != socket.id){
          socket.emit("startVideoPeer",{id: id, cid: cid})
        }
      }
    }, 100);
  });

  socket.on("requestVideoPeer", function(data){
    io.to(`${data.cid}`).emit("requestVideoPeer", data);
  })

  socket.on("responseVideoPeer", function(data){
    io.to(`${data.sid}`).emit("responseVideoPeer", data);
  })

  socket.on("new-ice-candidate", function(data){
    io.to(`${data.cid}`).emit("new-ice-candidate", data);
  });



  socket.on("changeRemotePermission", function(data){
    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == data.id){
        if(data.mouse){
          server.tabs[i].obj.mouse = data.mouse;
        }

        if(data.keyboard){
          server.tabs[i].obj.keyboard = data.keyboard;
        }

        if(data.file){
          server.tabs[i].obj.file = data.file;
        }

        io.emit("changeRemotePermission", data);
      }
    }
  });

  socket.on("remoteAction", function(data){
    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == data.id){
        io.to(`${server.tabs[i].obj.id}`).emit("remoteAction", data);
      }
    }
  });

  socket.on("addFileexplorer", function(data){
    let id = getTabId();
    let editor = {id: socket.id, files: data.files, path: data.path};
    let tab = {id: id, typ: "file", obj: editor};

    server.tabs.push(tab);

    io.emit("addTab", tab);
  })

  socket.on("openFileRequest", function(data){
    io.to(`${data.sid}`).emit("openFileRequest", data);
  });

  socket.on("openDirRequest", function(data){
    io.to(`${data.sid}`).emit("openDirRequest", data);
  });

  socket.on("addConsole", function(){
    let id = getTabId();
    let obj = {id: socket.id, commands: []};
    let tab = {id: id, typ: "console", obj: obj};

    server.tabs.push(tab);

    io.emit("addTab", tab);
  });

  socket.on("addCommand", function(data){
    io.to(`${data.sid}`).emit("addCommandRequest", data);
    //io.emit("addCommand", data);
  })

  socket.on("addCommandResponse", function(data){
    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == data.id){
        server.tabs[i].obj.commands.push(data);
        io.emit("addCommandResponse", data);
        break;
      }
    }
  });

  socket.on("removeTab", function(data){
    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == data.id){
        server.tabs.splice(i,1);
        break;
      }
    }
    io.emit("removeTab", data);
  })

  socket.on("changeEditor", function(data){
    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == data.id){
        server.tabs[i].obj.text = data.val;
      }
    }

    io.emit("changeEditor", data);
  });

  socket.on("streamVideo", function(stream, data){
    console.log(stream, data);
  });

  socket.on("updateCapture", function(data){
    io.emit("updateCapture", data);
    socket.emit("updateCaptureCall", {id: data.id})
  })
}

function getTabId(){
  let id, found = false;
  do{
    id = Math.random().toString(36).substr(2, 9);

    for(let i=0; i<server.tabs.length; i++){
      if(server.tabs[i].id == id){
        found = true;
        break;
      }
    }
  }while(found);

  return id;
}

function startTurn(){
  var server = new Turn({
    authMech: 'long-term',
    credentials: {
      sharecare: "pimmel3",
    },
    listeningPort: 45646,
  });
  server.start();
}

module.exports = {
  start: start,
  initServerSocket: initServerSocket,
};
