var CreateAgentRedirect=function(e,t,n,o,a,r){var c={};function s(){1==c.webSwitchOk&&1==c.webRtcActive&&(c.latency.current=-1,c.sendCtrlMsg('{"ctrlChannel":"102938","type":"webrtc0"}'),c.sendCtrlMsg('{"ctrlChannel":"102938","type":"webrtc1"}'),null!=c.onStateChanged&&c.onStateChanged(c,c.State))}((c.m=t).parent=c).meshserver=e,c.authCookie=o,c.rauthCookie=a,c.State=0,c.nodeid=null,c.options=null,c.socket=null,c.connectstate=-1,c.tunnelid=Math.random().toString(36).substring(2),c.protocol=t.protocol,c.onStateChanged=null,c.ctrlMsgAllowed=!0,c.attemptWebRTC=!1,c.webRtcActive=!1,c.webSwitchOk=!1,c.webchannel=null,c.webrtc=null,c.debugmode=0,c.serverIsRecording=!1,c.latency={lastSend:null,current:-1,callback:null},null==r&&(r="/"),c.consoleMessage=null,c.onConsoleMessageChange=null,c.Start=function(e){var t=window.location.protocol.replace("http","ws")+"//"+window.location.host+window.location.pathname.substring(0,window.location.pathname.lastIndexOf("/"))+"/meshrelay.ashx?browser=1&p="+c.protocol+"&nodeid="+e+"&id="+c.tunnelid;null!=o&&""!=o&&(t+="&auth="+o),null!=urlargs&&null!=urlargs.slowrelay&&(t+="&slowrelay="+urlargs.slowrelay),c.nodeid=e,c.connectstate=0,c.socket=new WebSocket(t),c.socket.onopen=c.xxOnSocketConnected,c.socket.onmessage=c.xxOnMessage,c.socket.onerror=function(e){},c.socket.onclose=c.xxOnSocketClosed,c.xxStateChange(1);var n="*"+r+"meshrelay.ashx?p="+c.protocol+"&nodeid="+e+"&id="+c.tunnelid;null!=a&&""!=a&&(n+="&rauth="+a),c.meshserver.send({action:"msg",type:"tunnel",nodeid:c.nodeid,value:n,usage:c.protocol})},c.xxOnSocketConnected=function(){1==c.debugmode&&console.log("onSocketConnected"),c.xxStateChange(2)},c.xxOnControlCommand=function(e){var t;try{t=JSON.parse(e)}catch(e){return}"102938"==t.ctrlChannel?("undefined"!=typeof args&&args.redirtrace&&console.log("RedirRecv",t),"console"==t.type?c.setConsoleMessage(t.msg,t.msgid,t.msgargs):"rtt"==t.type&&"number"==typeof t.time?(c.latency.current=(new Date).getTime()-t.time,null!=c.latency.callbacks&&c.latency.callback(c.latency.current)):null!=c.webrtc&&("answer"==t.type?c.webrtc.setRemoteDescription(new RTCSessionDescription(t),function(){},c.xxCloseWebRTC):"webrtc0"==t.type?(c.webSwitchOk=!0,s()):"webrtc1"==t.type?c.sendCtrlMsg('{"ctrlChannel":"102938","type":"webrtc2"}'):t.type)):c.xxOnSocketData(e)},c.setConsoleMessage=function(e,t,n){c.consoleMessage!=e&&(c.consoleMessage=e,c.consoleMessageId=t,c.consoleMessageArgs=n,c.onConsoleMessageChange&&c.onConsoleMessageChange(c,c.consoleMessage,c.consoleMessageId))},c.sendCtrlMsg=function(e){if(1==c.ctrlMsgAllowed){"undefined"!=typeof args&&args.redirtrace&&console.log("RedirSend",typeof e,e);try{c.socket.send(e)}catch(e){}}},c.xxOnMessage=function(e){if(c.State<3&&("c"==e.data||"cr"==e.data)){if("cr"==e.data&&(c.serverIsRecording=!0),null!=c.options){delete c.options.action,c.options.type="options";try{c.sendCtrlMsg(JSON.stringify(c.options))}catch(e){}}try{c.socket.send(c.protocol)}catch(e){}if(c.xxStateChange(3),1==c.attemptWebRTC){"undefined"!=typeof RTCPeerConnection?c.webrtc=new RTCPeerConnection(null):"undefined"!=typeof webkitRTCPeerConnection&&(c.webrtc=new webkitRTCPeerConnection(null)),null!=c.webrtc&&c.webrtc.createDataChannel&&(c.webchannel=c.webrtc.createDataChannel("DataChannel",{}),c.webchannel.onmessage=c.xxOnMessage,c.webchannel.onopen=function(){c.webRtcActive=!0,s()},c.webchannel.onclose=function(e){c.webRtcActive&&c.Stop()},c.webrtc.onicecandidate=function(e){if(null==e.candidate)try{c.sendCtrlMsg(JSON.stringify(c.webrtcoffer))}catch(e){}else c.webrtcoffer.sdp+="a="+e.candidate.candidate+"\r\n"},c.webrtc.oniceconnectionstatechange=function(){null!=c.webrtc&&("disconnected"==c.webrtc.iceConnectionState?1==c.webRtcActive?c.Stop():c.xxCloseWebRTC():"failed"==c.webrtc.iceConnectionState&&c.xxCloseWebRTC())},c.webrtc.createOffer(function(e){c.webrtcoffer=e,c.webrtc.setLocalDescription(e,function(){},c.xxCloseWebRTC)},c.xxCloseWebRTC,{mandatory:{OfferToReceiveAudio:!1,OfferToReceiveVideo:!1}}))}}else if("string"!=typeof e.data){if("object"==typeof e.data){if(1==i)return void d.push(e.data);if(l.readAsBinaryString&&null==c.m.ProcessBinaryData)i=!0,l.readAsBinaryString(new Blob([e.data]));else if(l.readAsArrayBuffer)i=!0,l.readAsArrayBuffer(e.data);else{for(var t="",n=new Uint8Array(e.data),o=n.byteLength,a=0;a<o;a++)t+=String.fromCharCode(n[a]);c.xxOnSocketData(t)}}else c.xxOnSocketData(e.data);if(1!=c.webRtcActive){var r=(new Date).getTime();(null==c.latency.lastSend||5e3<r-c.latency.lastSend)&&(c.latency.lastSend=r,c.sendCtrlMsg('{"ctrlChannel":"102938","type":"rtt","time":'+r+"}"))}}else c.xxOnControlCommand(e.data)};var l=new FileReader,i=!1,d=[];return l.readAsBinaryString&&null==c.m.ProcessBinaryData?l.onload=function(e){c.xxOnSocketData(e.target.result),0==d.length?i=!1:l.readAsBinaryString(new Blob([d.shift()]))}:l.readAsArrayBuffer&&(l.onloadend=function(e){c.xxOnSocketData(e.target.result),0==d.length?i=!1:l.readAsArrayBuffer(d.shift())}),c.xxOnSocketData=function(e){if(e&&-1!=c.connectstate){if("object"==typeof e){if(c.m.ProcessBinaryData)return c.m.ProcessBinaryData(e);for(var t="",n=new Uint8Array(e),o=n.byteLength,a=0;a<o;a++)t+=String.fromCharCode(n[a]);e=t}else if("string"!=typeof e)return;return"undefined"!=typeof args&&args.redirtrace&&console.log("RedirRecv",typeof e,e.length,"{"==e[0]?e:rstr2hex(e).substring(0,64)),c.m.ProcessData(e)}},c.sendText=function(e){"string"!=typeof e&&(e=JSON.stringify(e)),c.send(encode_utf8(e))},c.send=function(e){"undefined"!=typeof args&&args.redirtrace&&console.log("RedirSend",typeof e,e.length,"{"==e[0]?e:rstr2hex(e).substring(0,64));try{if(null!=c.socket&&c.socket.readyState==WebSocket.OPEN)if("string"==typeof e)if(1==c.debugmode){for(var t=new Uint8Array(e.length),n=[],o=0;o<e.length;++o)t[o]=e.charCodeAt(o),n.push(e.charCodeAt(o));1==c.webRtcActive?c.webchannel.send(t.buffer):c.socket.send(t.buffer)}else{for(t=new Uint8Array(e.length),o=0;o<e.length;++o)t[o]=e.charCodeAt(o);1==c.webRtcActive?c.webchannel.send(t.buffer):c.socket.send(t.buffer)}else 1==c.webRtcActive?c.webchannel.send(e):c.socket.send(e)}catch(e){}},c.xxOnSocketClosed=function(){c.Stop(1)},c.xxStateChange=function(e){c.State!=e&&(c.State=e,c.m.xxStateChange(c.State),null!=c.onStateChanged&&c.onStateChanged(c,c.State))},c.xxCloseWebRTC=function(){if(null!=c.webchannel){try{c.webchannel.close()}catch(e){}c.webchannel=null}if(null!=c.webrtc){try{c.webrtc.close()}catch(e){}c.webrtc=null}c.webRtcActive=!1},c.Stop=function(e){if(1==c.debugmode&&console.log("stop",e),c.xxCloseWebRTC(),c.connectstate=-1,null!=c.socket){try{1==c.socket.readyState&&(c.sendCtrlMsg('{"ctrlChannel":"102938","type":"close"}'),c.socket.close())}catch(e){}c.socket=null}c.xxStateChange(0)},c}