// Initial welcome page. Delete the following line to remove it.
'use strict';

window.$ = window.jQuery = require('jquery');
const fs = require('fs');



const sserver = require('./server.js');
const client = require('./client.js');

require('./css/bootstrap.min.css');
import '@fortawesome/fontawesome-free/js/all.js'

require('./js/bootstrap.min.js');

import "./css/main.css";


let server, socket;
let port = 45645;


fs.readFile(__static+"/template/index.html", "utf8", (err, data) => {
  if(err){
    console.error(err, data);
    return;
  }
  let dom = $(data);
  $("#app").append(dom);
  init();
});

function init() {
  document.title = 'Share&Care Login';

  let name = localStorage.getItem('user-name');
  if(name){
    $("#login-name").val(name);
  }

  let ip = localStorage.getItem('ip');
  if(ip){
    $("#login-ip").val(ip);
  }

  let port = localStorage.getItem('port');
  if(port){
    $("#login-port").val(port);
  }

  $("#login-host").on("click", host);
  $("#login-join").on("click", join);
}


function host(e){
  let name = $("#login-name").val().trim();
  let password = $("#login-password").val().trim();
  let pvalue = $("#login-port").val().trim();



  if(name.length == 0){
    console.error("no name");
    return;
  }

  localStorage.setItem('user-name', name);
  localStorage.setItem('port', pvalue);

  $("#login-host, #login-join").prop("disabled", true);

  let p = port;
  if(pvalue.length > 0){
    p = pvalue;
  }

  try{
    server = sserver.start(p, password);

    socket = client.connect(name, "localhost:"+p, password);
  }
  catch(e){
    console.error(e);
    alert("Server already running!");
    $("#login-host, #login-join").prop("disabled", false);
    return;
  }

  document.title = 'Host: '+name+' || Port: '+p;
}

function join(e){
  let name = $("#login-name").val().trim();
  let ip = $("#login-ip").val().trim();
  let p = $("#login-port").val().trim();
  let password = $("#login-password").val().trim();

  if(name.length == 0){
    console.log("no name");
    return;
  }

  localStorage.setItem('user-name', name);

  if(ip.length == 0){
    console.log("no ip");
    return;
  }

  localStorage.setItem('ip', ip);
  localStorage.setItem('port', p);

  if(p.length > 0){
    ip = ip+":"+p;
  }

  $("#login-host, #login-join").prop("disabled", true);
  socket = client.connect(name, ip, password);

  document.title = 'Client: '+name+' || Server: '+ip;
}
