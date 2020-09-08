var CreateWsmanComm=function(e,t,r,n,a){var c={};function o(){for(i in c.socketState=2,c.pendingAjaxCall)c.sendRequest(c.pendingAjaxCall[i][0],c.pendingAjaxCall[i][3],c.pendingAjaxCall[i][4])}function s(e){for(c.socketAccumulator+=function(e){return String.fromCharCode.apply(null,e)}(new Uint8Array(e.data));;){if(0==c.socketParseState){var t=c.socketAccumulator.indexOf("\r\n\r\n");if(t<0)return;if(c.socketHeader=c.socketAccumulator.substring(0,t).split("\r\n"),null==c.amtVersion)for(var r in c.socketHeader)0==c.socketHeader[r].indexOf("Server: Intel(R) Active Management Technology ")&&(c.amtVersion=c.socketHeader[r].substring(46));for(r in c.socketAccumulator=c.socketAccumulator.substring(t+4),c.socketParseState=1,c.socketData="",c.socketXHeader={Directive:c.socketHeader[0].split(" ")},c.socketHeader)if(0!=r){var n=c.socketHeader[r].indexOf(":");c.socketXHeader[c.socketHeader[r].substring(0,n).toLowerCase()]=c.socketHeader[r].substring(n+2)}}if(1==c.socketParseState){var a=-1;if(null==c.socketXHeader.connection||"close"!=c.socketXHeader.connection.toLowerCase()||null!=c.socketXHeader["transfer-encoding"]&&"chunked"==c.socketXHeader["transfer-encoding"].toLowerCase())if(null!=c.socketXHeader["content-length"]){if(a=parseInt(c.socketXHeader["content-length"]),c.socketAccumulator.length<a)return;var o=c.socketAccumulator.substring(0,a);c.socketAccumulator=c.socketAccumulator.substring(a),c.socketData=o,a=0}else{var s=c.socketAccumulator.indexOf("\r\n");if(s<0)return;if(a=parseInt(c.socketAccumulator.substring(0,s),16),isNaN(a))return void(c.websocket&&c.websocket.close());if(c.socketAccumulator.length<s+2+a+2)return;o=c.socketAccumulator.substring(s+2,s+2+a);c.socketAccumulator=c.socketAccumulator.substring(s+2+a+2),c.socketData+=o}else a=0;0==a&&(l(c.socketXHeader,c.socketData),c.socketParseState=0,c.socketHeader=null)}}}function l(e,t){var r=parseInt(e.Directive[1]);if(isNaN(r)&&(r=602),401==r&&++c.authcounter<3){if(c.challengeParams=c.parseDigest(e["www-authenticate"]),null!=c.challengeParams.qop){var n=c.challengeParams.qop.split(",");for(var a in n)n[a]=n[a].trim();0<=n.indexOf("auth-int")?c.challengeParams.qop="auth-int":c.challengeParams.qop="auth"}}else{var o=c.pendingAjaxCall.shift();c.authcounter=0,c.ActiveAjaxCount--,c.gotNextMessages(t,"success",{status:r},o),c.PerformNextAjax()}}function u(e){if(c.socketState=0,null!=c.socket&&(c.socket.close(),c.socket=null),0<c.pendingAjaxCall.length){var t=c.pendingAjaxCall.shift(),r=t[5];c.PerformAjaxExNodeJS2(t[0],t[1],t[2],t[3],t[4],--r)}}return c.PendingAjax=[],c.ActiveAjaxCount=0,c.MaxActiveAjaxCount=1,c.FailAllError=0,c.challengeParams=null,c.noncecounter=1,c.authcounter=0,c.socket=null,c.socketState=0,c.host=e,c.port=t,c.user=r,c.pass=n,c.tls=a,c.tlsv1only=1,c.cnonce=Math.random().toString(36).substring(7),c.PerformAjax=function(e,t,r,n,a,o){c.ActiveAjaxCount<c.MaxActiveAjaxCount&&0==c.PendingAjax.length?c.PerformAjaxEx(e,t,r,a,o):1==n?c.PendingAjax.unshift([e,t,r,a,o]):c.PendingAjax.push([e,t,r,a,o])},c.PerformNextAjax=function(){if(!(c.ActiveAjaxCount>=c.MaxActiveAjaxCount||0==c.PendingAjax.length)){var e=c.PendingAjax.shift();c.PerformAjaxEx(e[0],e[1],e[2],e[3],e[4]),c.PerformNextAjax()}},c.PerformAjaxEx=function(e,t,r,n,a){if(0==c.FailAllError)return e=e||"",c.ActiveAjaxCount++,c.PerformAjaxExNodeJS(e,t,r,n,a);c.gotNextMessagesError({status:c.FailAllError},"error",null,[e,t,r,n,a])},c.pendingAjaxCall=[],c.PerformAjaxExNodeJS=function(e,t,r,n,a){c.PerformAjaxExNodeJS2(e,t,r,n,a,3)},c.PerformAjaxExNodeJS2=function(e,t,r,n,a,o){if(o<=0||0!=c.FailAllError)return c.ActiveAjaxCount--,999!=c.FailAllError&&c.gotNextMessages(null,"error",{status:0==c.FailAllError?408:c.FailAllError},[e,t,r,n,a]),void c.PerformNextAjax();c.pendingAjaxCall.push([e,t,r,n,a,o]),0==c.socketState?c.xxConnectHttpSocket():2==c.socketState&&c.sendRequest(e,n,a)},c.sendRequest=function(e,t,r){var n=(r=r||"POST")+" "+(t=t||"/wsman")+" HTTP/1.1\r\n";if(null!=c.challengeParams){var a=hex_md5(hex_md5(c.user+":"+c.challengeParams.realm+":"+c.pass)+":"+c.challengeParams.nonce+":"+c.noncecounter+":"+c.cnonce+":"+c.challengeParams.qop+":"+hex_md5(r+":"+t+("auth-int"==c.challengeParams.qop?":"+hex_md5(e):"")));n+="Authorization: "+c.renderDigest({username:c.user,realm:c.challengeParams.realm,nonce:c.challengeParams.nonce,uri:t,qop:c.challengeParams.qop,response:a,nc:c.noncecounter++,cnonce:c.cnonce})+"\r\n"}!function(e){if(2==c.socketState&&null!=c.socket&&c.socket.readyState==WebSocket.OPEN){for(var t=new Uint8Array(e.length),r=0;r<e.length;++r)t[r]=e.charCodeAt(r);try{c.socket.send(t.buffer)}catch(e){}}}(n+="Host: "+c.host+":"+c.port+"\r\nTransfer-Encoding: chunked\r\n\r\n"+e.length.toString(16).toUpperCase()+"\r\n"+e+"\r\n0\r\n\r\n")},c.parseDigest=function(e){return function(e){return e.split(",").reduce(function(e,t){return e.ic?e.st[e.st.length-1]+=","+t:e.st.push(t),t.split('"').length%2==0&&(e.ic=!e.ic),e},{st:[],ic:!1}).st}(e.substring(7)).reduce(function(e,t){var r=t.trim().split("=");return e[r[0]]=r[1].replace(new RegExp('"',"g"),""),e},{})},c.renderDigest=function(r){var e=[];for(i in r)e.push(i);return"Digest "+e.reduce(function(e,t){return e+","+t+'="'+r[t]+'"'},"").substring(1)},c.xxConnectHttpSocket=function(){c.socketParseState=0,c.socketAccumulator="",c.socketHeader=null,c.socketData="",c.socketState=1,c.socket=new WebSocket(window.location.protocol.replace("http","ws")+"//"+window.location.host+window.location.pathname.substring(0,window.location.pathname.lastIndexOf("/"))+"/webrelay.ashx?p=1&host="+c.host+"&port="+c.port+"&tls="+c.tls+"&tlsv1only="+c.tlsv1only+("*"==r?"&serverauth=1":"")+(void 0===n?"&serverauth=1&user="+r:"")),c.socket.binaryType="arraybuffer",c.socket.onopen=o,c.socket.onmessage=s,c.socket.onclose=u},c.gotNextMessages=function(e,t,r,n){999!=c.FailAllError&&(0==c.FailAllError?200==r.status?n[1](e,200,n[2]):n[1](null,r.status,n[2]):n[1](null,c.FailAllError,n[2]))},c.gotNextMessagesError=function(e,t,r,n){999!=c.FailAllError&&(0==c.FailAllError?n[1](c,null,{Header:{HttpError:e.status}},e.status,n[2]):n[1](null,c.FailAllError,n[2]))},c.CancelAllQueries=function(e){for(;0<c.PendingAjax.length;){var t=c.PendingAjax.shift();t[1](null,e,t[2])}null!=c.websocket&&(c.websocket.close(),c.websocket=null,c.socketState=0)},c}