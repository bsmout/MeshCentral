var CreateAgentRemoteDesktop=function(e,t){var g={};"string"==typeof(g.CanvasId=e)&&(g.CanvasId=Q(e)),g.Canvas=g.CanvasId.getContext("2d"),g.scrolldiv=t,g.State=0,g.PendingOperations=[],g.tilesReceived=0,g.TilesDrawn=0,g.KillDraw=0,g.ipad=!1,g.tabletKeyboardVisible=!1,g.LastX=0,g.LastY=0,g.touchenabled=0,g.submenuoffset=0,g.touchtimer=null,g.TouchArray={},g.connectmode=0,g.connectioncount=0,g.rotation=0,g.protocol=2,g.debugmode=0,g.firstUpKeys=[],g.stopInput=!1,g.localKeyMap=!0,g.pressedKeys=[],g.sessionid=0,g.username,g.oldie=!1,g.CompressionLevel=50,g.ScalingLevel=1024,g.FrameRateTimer=100,g.FirstDraw=!1,g.ScreenWidth=960,g.ScreenHeight=700,g.width=960,g.height=960,g.onScreenSizeChange=null,g.onMessage=null,g.onConnectCountChanged=null,g.onDebugMessage=null,g.onTouchEnabledChanged=null,g.onDisplayinfo=null,g.accumulator=null;var v=["default","progress","crosshair","pointer","help","text","no-drop","move","nesw-resize","ns-resize","nwse-resize","w-resize","alias","wait","none","not-allowed","col-resize","row-resize","copy","zoom-in","zoom-out"];g.Start=function(){g.State=0,g.accumulator=null},g.Stop=function(){g.setRotation(0),g.UnGrabKeyInput(),g.UnGrabMouseInput(),g.touchenabled=0,null!=g.onScreenSizeChange&&g.onScreenSizeChange(g,g.ScreenWidth,g.ScreenHeight,g.CanvasId),g.Canvas.clearRect(0,0,g.CanvasId.width,g.CanvasId.height)},g.xxStateChange=function(e){if(g.State!=e)switch(g.State=e,g.CanvasId.style.cursor="default",e){case 0:g.Stop()}},g.send=function(e){1<g.debugmode&&console.log("KSend("+e.length+"): "+rstr2hex(e)),null!=g.parent&&g.parent.send(e)},g.ProcessPictureMsg=function(e,t,n){var o=new Image;o.xcount=g.tilesReceived++;var a=g.tilesReceived;o.src="data:image/jpeg;base64,"+btoa(e.substring(4,e.length)),o.onload=function(){if(null!=g.Canvas&&g.KillDraw<a&&0!=g.State)for(g.PendingOperations.push([a,2,o,t,n]);g.DoPendingOperations(););},o.error=function(){console.log("DecodeTileError")}},g.DoPendingOperations=function(){if(0==g.PendingOperations.length)return!1;for(var e=0;e<g.PendingOperations.length;e++){var t=g.PendingOperations[e];if(t[0]==g.TilesDrawn+1)return 1==t[1]?g.ProcessCopyRectMsg(t[2]):2==t[1]&&(g.Canvas.drawImage(t[2],g.rotX(t[3],t[4]),g.rotY(t[3],t[4])),delete t[2]),g.PendingOperations.splice(e,1),delete t,g.TilesDrawn++,g.TilesDrawn==g.tilesReceived&&g.KillDraw<g.TilesDrawn&&(g.KillDraw=g.TilesDrawn=g.tilesReceived=0),!0}return g.oldie&&0<g.PendingOperations.length&&g.TilesDrawn++,!1},g.ProcessCopyRectMsg=function(e){var t=((255&e.charCodeAt(0))<<8)+(255&e.charCodeAt(1)),n=((255&e.charCodeAt(2))<<8)+(255&e.charCodeAt(3)),o=((255&e.charCodeAt(4))<<8)+(255&e.charCodeAt(5)),a=((255&e.charCodeAt(6))<<8)+(255&e.charCodeAt(7)),r=((255&e.charCodeAt(8))<<8)+(255&e.charCodeAt(9)),s=((255&e.charCodeAt(10))<<8)+(255&e.charCodeAt(11));g.Canvas.drawImage(Canvas.canvas,t,n,r,s,o,a,r,s)},g.SendUnPause=function(){g.send(String.fromCharCode(0,8,0,5,0))},g.SendPause=function(){g.send(String.fromCharCode(0,8,0,5,1))},g.SendCompressionLevel=function(e,t,n,o){t&&(g.CompressionLevel=t),n&&(g.ScalingLevel=n),o&&(g.FrameRateTimer=o),g.send(String.fromCharCode(0,5,0,10,e,g.CompressionLevel)+g.shortToStr(g.ScalingLevel)+g.shortToStr(g.FrameRateTimer))},g.SendRefresh=function(){g.send(String.fromCharCode(0,6,0,4))},g.ProcessScreenMsg=function(e,t){for(0<g.debugmode&&console.log("ScreenSize: "+e+" x "+t),g.Canvas.setTransform(1,0,0,1,0,0),g.rotation=0,g.FirstDraw=!0,g.ScreenWidth=g.width=e,g.ScreenHeight=g.height=t,g.KillDraw=g.tilesReceived;0<g.PendingOperations.length;)g.PendingOperations.shift();g.SendCompressionLevel(1),g.SendUnPause(),null!=g.onScreenSizeChange&&g.onScreenSizeChange(g,g.ScreenWidth,g.ScreenHeight,g.CanvasId)},g.ProcessData=function(e){for(var t=0;t<e.length;){var n=g.ProcessDataEx(e.substring(t));if(null==n||0==n)break;t+=n}},g.ProcessDataEx=function(e){if(null!=g.accumulator&&(e=g.accumulator+e,g.accumulator=null),1<g.debugmode&&console.log("KRecv("+e.length+"): "+rstr2hex(e.substring(0,Math.min(e.length,40)))),!(e.length<4)){var t=null,n=0,o=0,a=ReadShort(e,0),r=ReadShort(e,2),s=0;if(null!=g.recordedData&&(g.recordedData.push(p(2,1,e.length)),g.recordedData.push(e)),27==a&&8==r){if(e.length<12)return;if(a=ReadShort(e,8),(r=ReadInt(e,4))+8>e.length)return void(g.accumulator=e);e=e.substring(8),s=8}if(r!=e.length&&0<g.debugmode&&console.log(r,e.length,r==e.length),18<=a&&65!=a&&88!=a)return console.error("Invalid KVM command "+a+" of size "+r),console.log("Invalid KVM data",e.length,rstr2hex(e.substring(0,40))+"..."),void(g.parent&&g.parent.setConsoleMessage&&g.parent.setConsoleMessage("Received invalid network data",5));if(!(r>e.length)){switch(3!=a&&4!=a&&7!=a||(n=((255&(t=e.substring(4,r)).charCodeAt(0))<<8)+(255&t.charCodeAt(1)),o=((255&t.charCodeAt(2))<<8)+(255&t.charCodeAt(3)),0<g.debugmode&&console.log("CMD"+a+" at X="+n+" Y="+o)),a){case 3:g.FirstDraw&&g.onResize(),g.ProcessPictureMsg(t,n,o);break;case 4:g.FirstDraw&&g.onResize(),g.TilesDrawn==g.tilesReceived?g.ProcessCopyRectMsg(t):g.PendingOperations.push([++tilesReceived,1,t]);break;case 7:g.ProcessScreenMsg(n,o),g.SendKeyMsgKC(g.KeyAction.UP,16),g.SendKeyMsgKC(g.KeyAction.UP,17),g.SendKeyMsgKC(g.KeyAction.UP,18),g.SendKeyMsgKC(g.KeyAction.UP,91),g.SendKeyMsgKC(g.KeyAction.UP,92),g.SendKeyMsgKC(g.KeyAction.UP,16),g.send(String.fromCharCode(0,14,0,4));break;case 11:var i=0,c={},u=((255&e.charCodeAt(4))<<8)+(255&e.charCodeAt(5));if(0<u){i=((255&e.charCodeAt(6+2*u))<<8)+(255&e.charCodeAt(7+2*u));for(var l=0;l<u;l++){var d=((255&e.charCodeAt(6+2*l))<<8)+(255&e.charCodeAt(7+2*l));c[d]=65535==d?"All Displays":"Display "+d}}null!=g.onDisplayinfo&&g.onDisplayinfo(g,c,i);break;case 12:break;case 14:g.touchenabled=1,g.TouchArray={},null!=g.onTouchEnabledChanged&&g.onTouchEnabledChanged(g.touchenabled);break;case 15:g.TouchArray={};break;case 16:g.connectioncount=ReadInt(e,4),null!=g.onConnectCountChanged&&g.onConnectCountChanged(g.connectioncount,g);break;case 17:null!=g.onMessage&&g.onMessage(e.substring(4,r),g);break;case 65:"."!=(e=e.substring(4))[0]?(console.log(e),g.parent&&g.parent.setConsoleMessage&&g.parent.setConsoleMessage(e)):console.log("KVM: "+e.substring(1));break;case 88:if(5!=r)break;var h=e.charCodeAt(4);v.length<h&&(h=0),g.CanvasId.style.cursor=v[h]}return r+s}g.accumulator=e}},g.MouseButton={NONE:0,LEFT:2,RIGHT:8,MIDDLE:32},g.KeyAction={NONE:0,DOWN:1,UP:2,SCROLL:3,EXUP:4,EXDOWN:5,DBLCLICK:6},g.InputType={KEY:1,MOUSE:2,CTRLALTDEL:10,TOUCH:15},g.Alternate=0;var o={Pause:19,CapsLock:20,Space:32,Quote:222,Minus:189,NumpadMultiply:106,NumpadAdd:107,PrintScreen:44,Comma:188,NumpadSubtract:109,NumpadDecimal:110,Period:190,Slash:191,NumpadDivide:111,Semicolon:186,Equal:187,OSLeft:91,BracketLeft:219,OSRight:91,Backslash:220,BracketRight:221,ContextMenu:93,Backquote:192,NumLock:144,ScrollLock:145,Backspace:8,Tab:9,Enter:13,NumpadEnter:13,Escape:27,Delete:46,Home:36,PageUp:33,PageDown:34,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,End:35,Insert:45,F1:112,F2:113,F3:114,F4:115,F5:116,F6:117,F7:118,F8:119,F9:120,F10:121,F11:122,F12:123,ShiftLeft:16,ShiftRight:16,ControlLeft:17,ControlRight:17,AltLeft:18,AltRight:18,MetaLeft:91,MetaRight:92,VolumeMute:181};function p(e,t,n){var o=Date.now();return"number"==typeof n?(g.recordedSize+=n,g.shortToStr(e)+g.shortToStr(t)+g.intToStr(n)+g.intToStr(o>>32)+g.intToStr(32&o)):(g.recordedSize+=n.length,g.shortToStr(e)+g.shortToStr(t)+g.intToStr(n.length)+g.intToStr(o>>32)+g.intToStr(32&o)+n)}return g.SendKeyMsg=function(e,t){var n;null!=e&&((t=t||window.event).code&&0==g.localKeyMap?null!=(n=function(e){return e.code.startsWith("Key")&&4==e.code.length?e.code.charCodeAt(3):e.code.startsWith("Digit")&&6==e.code.length?e.code.charCodeAt(5):e.code.startsWith("Numpad")&&7==e.code.length?e.code.charCodeAt(6)+48:o[e.code]}(t))&&g.SendKeyMsgKC(e,n):(59==(n=t.keyCode)?n=186:173==n?n=189:61==n&&(n=187),g.SendKeyMsgKC(e,n)))},g.SendMessage=function(e){3==g.State&&g.send(String.fromCharCode(0,17)+g.shortToStr(4+e.length)+e)},g.SendKeyMsgKC=function(e,t){if(3==g.State)if("object"==typeof e)for(var n in e)g.SendKeyMsgKC(e[n][0],e[n][1]);else{if(1==e)-1==g.pressedKeys.indexOf(t)&&g.pressedKeys.unshift(t);else if(2==e){-1!=(n=g.pressedKeys.indexOf(t))&&g.pressedKeys.splice(n,1)}g.send(String.fromCharCode(0,g.InputType.KEY,0,6,e-1,t))}},g.sendcad=function(){g.SendCtrlAltDelMsg()},g.SendCtrlAltDelMsg=function(){3==g.State&&g.send(String.fromCharCode(0,g.InputType.CTRLALTDEL,0,4))},g.SendEscKey=function(){3==g.State&&g.send(String.fromCharCode(0,g.InputType.KEY,0,6,0,27,0,g.InputType.KEY,0,6,1,27))},g.SendStartMsg=function(){g.SendKeyMsgKC(g.KeyAction.EXDOWN,91),g.SendKeyMsgKC(g.KeyAction.EXUP,91)},g.SendCharmsMsg=function(){g.SendKeyMsgKC(g.KeyAction.EXDOWN,91),g.SendKeyMsgKC(g.KeyAction.DOWN,67),g.SendKeyMsgKC(g.KeyAction.UP,67),g.SendKeyMsgKC(g.KeyAction.EXUP,91)},g.SendTouchMsg1=function(e,t,n,o){3==g.State&&g.send(String.fromCharCode(0,g.InputType.TOUCH)+g.shortToStr(14)+String.fromCharCode(1,e)+g.intToStr(t)+g.shortToStr(n)+g.shortToStr(o))},g.SendTouchMsg2=function(e,t){var n,o="";for(var a in g.TouchArray)a==e?n=t:1==g.TouchArray[a].f?(n=65542,g.TouchArray[a].f=3,"START"+a):2==g.TouchArray[a].f?(n=262144,"STOP"+a):n=131078,o+=String.fromCharCode(a)+g.intToStr(n)+g.shortToStr(g.TouchArray[a].x)+g.shortToStr(g.TouchArray[a].y),2==g.TouchArray[a].f&&delete g.TouchArray[a];3==g.State&&g.send(String.fromCharCode(0,g.InputType.TOUCH)+g.shortToStr(5+o.length)+String.fromCharCode(2)+o),0==Object.keys(g.TouchArray).length&&null!=g.touchtimer&&(clearInterval(g.touchtimer),g.touchtimer=null)},g.SendMouseMsg=function(e,t){if(3==g.State&&null!=e&&null!=g.Canvas){if(!t)t=window.event;var n=g.Canvas.canvas.height/g.CanvasId.clientHeight,o=g.Canvas.canvas.width/g.CanvasId.clientWidth,a=g.GetPositionOfControl(g.Canvas.canvas),r=(t.pageX-a[0])*o,s=(t.pageY-a[1])*n;if(t.addx&&(r+=t.addx),t.addy&&(s+=t.addy),0<=r&&r<=g.Canvas.canvas.width&&0<=s&&s<=g.Canvas.canvas.height){var i=0,c=0;e==g.KeyAction.UP||e==g.KeyAction.DOWN?t.which?i=1==t.which?g.MouseButton.LEFT:2==t.which?g.MouseButton.MIDDLE:g.MouseButton.RIGHT:t.button&&(i=0==t.button?g.MouseButton.LEFT:1==t.button?g.MouseButton.MIDDLE:g.MouseButton.RIGHT):e==g.KeyAction.SCROLL&&(t.detail?c=120*t.detail*-1:t.wheelDelta&&(c=3*t.wheelDelta));var u="";u=e==g.KeyAction.DBLCLICK?String.fromCharCode(0,g.InputType.MOUSE,0,10,0,136,r/256&255,255&r,s/256&255,255&s):e==g.KeyAction.SCROLL?String.fromCharCode(0,g.InputType.MOUSE,0,12,0,0,r/256&255,255&r,s/256&255,255&s,c/256&255,255&c):String.fromCharCode(0,g.InputType.MOUSE,0,10,0,e==g.KeyAction.DOWN?i:2*i&255,r/256&255,255&r,s/256&255,255&s),g.Action==g.KeyAction.NONE?0==g.Alternate||g.ipad?(g.send(u),g.Alternate=1):g.Alternate=0:g.send(u)}}},g.GetDisplayNumbers=function(){g.send(String.fromCharCode(0,11,0,4))},g.SetDisplay=function(e){g.send(String.fromCharCode(0,12,0,6,e>>8,255&e))},g.intToStr=function(e){return String.fromCharCode(e>>24&255,e>>16&255,e>>8&255,255&e)},g.shortToStr=function(e){return String.fromCharCode(e>>8&255,255&e)},g.onResize=function(){0!=g.ScreenWidth&&0!=g.ScreenHeight&&(g.Canvas.canvas.width==g.ScreenWidth&&g.Canvas.canvas.height==g.ScreenHeight||(g.FirstDraw&&(g.Canvas.canvas.width=g.ScreenWidth,g.Canvas.canvas.height=g.ScreenHeight,g.Canvas.fillRect(0,0,g.ScreenWidth,g.ScreenHeight),null!=g.onScreenSizeChange&&g.onScreenSizeChange(g,g.ScreenWidth,g.ScreenHeight,g.CanvasId)),g.FirstDraw=!1))},g.xxMouseInputGrab=!1,g.xxKeyInputGrab=!1,g.xxMouseMove=function(e){return 3==g.State&&g.SendMouseMsg(g.KeyAction.NONE,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxMouseUp=function(e){return 3==g.State&&g.SendMouseMsg(g.KeyAction.UP,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxMouseDown=function(e){return 3==g.State&&g.SendMouseMsg(g.KeyAction.DOWN,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxMouseDblClick=function(e){return 3==g.State&&g.SendMouseMsg(g.KeyAction.DBLCLICK,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxDOMMouseScroll=function(e){return 3!=g.State||(g.SendMouseMsg(g.KeyAction.SCROLL,e),!1)},g.xxMouseWheel=function(e){return 3!=g.State||(g.SendMouseMsg(g.KeyAction.SCROLL,e),!1)},g.xxKeyUp=function(e){return 3==g.State&&g.SendKeyMsg(g.KeyAction.UP,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxKeyDown=function(e){return 3==g.State&&g.SendKeyMsg(g.KeyAction.DOWN,e),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.xxKeyPress=function(e){return e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g.handleKeys=function(e){return 1!=g.stopInput&&3==desktop.State&&g.xxKeyPress(e)},g.handleKeyUp=function(e){if(1==g.stopInput||3!=desktop.State)return!1;if(g.firstUpKeys.length<5&&(g.firstUpKeys.push(e.keyCode),5==g.firstUpKeys.length)){var t=g.firstUpKeys.join(",");"16,17,91,91,16"!=t&&"16,17,18,91,92"!=t||(g.stopInput=!0)}return g.xxKeyUp(e)},g.handleKeyDown=function(e){return 1!=g.stopInput&&3==desktop.State&&g.xxKeyDown(e)},g.handleReleaseKeys=function(){var e=JSON.parse(JSON.stringify(g.pressedKeys));for(var t in e)g.SendKeyMsgKC(g.KeyAction.UP,e[t])},g.mousedblclick=function(e){return 1!=g.stopInput&&g.xxMouseDblClick(e)},g.mousedown=function(e){return 1!=g.stopInput&&g.xxMouseDown(e)},g.mouseup=function(e){return 1!=g.stopInput&&g.xxMouseUp(e)},g.mousemove=function(e){return 1!=g.stopInput&&g.xxMouseMove(e)},g.mousewheel=function(e){return 1!=g.stopInput&&g.xxMouseWheel(e)},g.xxMsTouchEvent=function(e){if(4!=e.originalEvent.pointerType){if(e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),"MSPointerDown"==e.type||"MSPointerMove"==e.type||"MSPointerUp"==e.type){var t=0,n=e.originalEvent.pointerId%256,o=e.offsetX*(Canvas.canvas.width/g.CanvasId.clientWidth),a=e.offsetY*(Canvas.canvas.height/g.CanvasId.clientHeight);"MSPointerDown"==e.type?t=65542:"MSPointerMove"==e.type?t=131078:"MSPointerUp"==e.type&&(t=262144),g.TouchArray[n]||(g.TouchArray[n]={x:o,y:a}),g.SendTouchMsg2(n,t),"MSPointerUp"==e.type&&delete g.TouchArray[n]}else alert(e.type);return!0}},g.xxTouchStart=function(e){if(3==g.State)if(e.preventDefault&&e.preventDefault(),0==g.touchenabled||1==g.touchenabled){if(1<e.originalEvent.touches.length)return;var t=e.originalEvent.touches[0];e.which=1,g.LastX=e.pageX=t.pageX,g.LastY=e.pageY=t.pageY,g.SendMouseMsg(KeyAction.DOWN,e)}else{var n=g.GetPositionOfControl(Canvas.canvas);for(var o in e.originalEvent.changedTouches)if(e.originalEvent.changedTouches[o].identifier){var a=e.originalEvent.changedTouches[o].identifier%256;g.TouchArray[a]||(g.TouchArray[a]={x:(e.originalEvent.touches[o].pageX-n[0])*(Canvas.canvas.width/g.CanvasId.clientWidth),y:(e.originalEvent.touches[o].pageY-n[1])*(Canvas.canvas.height/g.CanvasId.clientHeight),f:1})}0<Object.keys(g.TouchArray).length&&null==touchtimer&&(g.touchtimer=setInterval(function(){g.SendTouchMsg2(256,0)},50))}},g.xxTouchMove=function(e){if(3==g.State)if(e.preventDefault&&e.preventDefault(),0==g.touchenabled||1==g.touchenabled){if(1<e.originalEvent.touches.length)return;var t=e.originalEvent.touches[0];e.which=1,g.LastX=e.pageX=t.pageX,g.LastY=e.pageY=t.pageY,g.SendMouseMsg(g.KeyAction.NONE,e)}else{var n=g.GetPositionOfControl(Canvas.canvas);for(var o in e.originalEvent.changedTouches)if(e.originalEvent.changedTouches[o].identifier){var a=e.originalEvent.changedTouches[o].identifier%256;g.TouchArray[a]&&(g.TouchArray[a].x=(e.originalEvent.touches[o].pageX-n[0])*(g.Canvas.canvas.width/g.CanvasId.clientWidth),g.TouchArray[a].y=(e.originalEvent.touches[o].pageY-n[1])*(g.Canvas.canvas.height/g.CanvasId.clientHeight))}}},g.xxTouchEnd=function(e){if(3==g.State)if(e.preventDefault&&e.preventDefault(),0==g.touchenabled||1==g.touchenabled){if(1<e.originalEvent.touches.length)return;e.which=1,e.pageX=LastX,e.pageY=LastY,g.SendMouseMsg(KeyAction.UP,e)}else for(var t in e.originalEvent.changedTouches)if(e.originalEvent.changedTouches[t].identifier){var n=e.originalEvent.changedTouches[t].identifier%256;g.TouchArray[n]&&(g.TouchArray[n].f=2)}},g.GrabMouseInput=function(){if(1!=g.xxMouseInputGrab){var e=g.CanvasId;e.onmousemove=g.xxMouseMove,e.onmouseup=g.xxMouseUp,e.onmousedown=g.xxMouseDown,e.touchstart=g.xxTouchStart,e.touchmove=g.xxTouchMove,e.touchend=g.xxTouchEnd,e.MSPointerDown=g.xxMsTouchEvent,e.MSPointerMove=g.xxMsTouchEvent,e.MSPointerUp=g.xxMsTouchEvent,navigator.userAgent.match(/mozilla/i)?e.DOMMouseScroll=g.xxDOMMouseScroll:e.onmousewheel=g.xxMouseWheel,g.xxMouseInputGrab=!0}},g.UnGrabMouseInput=function(){if(0!=g.xxMouseInputGrab){var e=g.CanvasId;e.onmousemove=null,e.onmouseup=null,e.onmousedown=null,e.touchstart=null,e.touchmove=null,e.touchend=null,e.MSPointerDown=null,e.MSPointerMove=null,e.MSPointerUp=null,navigator.userAgent.match(/mozilla/i)?e.DOMMouseScroll=null:e.onmousewheel=null,g.xxMouseInputGrab=!1}},g.GrabKeyInput=function(){1!=g.xxKeyInputGrab&&(document.onkeyup=g.xxKeyUp,document.onkeydown=g.xxKeyDown,document.onkeypress=g.xxKeyPress,g.xxKeyInputGrab=!0)},g.UnGrabKeyInput=function(){0!=g.xxKeyInputGrab&&(document.onkeyup=null,document.onkeydown=null,document.onkeypress=null,g.xxKeyInputGrab=!1)},g.GetPositionOfControl=function(e){var t=Array(2);for(t[0]=t[1]=0;e;)t[0]+=e.offsetLeft,t[1]+=e.offsetTop,e=e.offsetParent;return t},g.crotX=function(e,t){return 0==g.rotation?e:1==g.rotation?t:2==g.rotation?g.Canvas.canvas.width-e:3==g.rotation?g.Canvas.canvas.height-t:void 0},g.crotY=function(e,t){return 0==g.rotation?t:1==g.rotation?g.Canvas.canvas.width-e:2==g.rotation?g.Canvas.canvas.height-t:3==g.rotation?e:void 0},g.rotX=function(e,t){return 0==g.rotation||1==g.rotation?e:2==g.rotation?e-g.Canvas.canvas.width:3==g.rotation?e-g.Canvas.canvas.height:void 0},g.rotY=function(e,t){return 0==g.rotation||3==g.rotation?t:1==g.rotation?t-g.Canvas.canvas.width:2==g.rotation?t-g.Canvas.canvas.height:void 0},g.tcanvas=null,g.setRotation=function(e){for(;e<0;)e+=4;var t=e%4;if(t==g.rotation)return!0;var n=g.Canvas.canvas.width,o=g.Canvas.canvas.height;1!=g.rotation&&3!=g.rotation||(n=g.Canvas.canvas.height,o=g.Canvas.canvas.width),null==g.tcanvas&&(g.tcanvas=document.createElement("canvas"));var a=g.tcanvas.getContext("2d");return a.setTransform(1,0,0,1,0,0),a.canvas.width=n,a.canvas.height=o,a.rotate(-90*g.rotation*Math.PI/180),0==g.rotation&&a.drawImage(g.Canvas.canvas,0,0),1==g.rotation&&a.drawImage(g.Canvas.canvas,-g.Canvas.canvas.width,0),2==g.rotation&&a.drawImage(g.Canvas.canvas,-g.Canvas.canvas.width,-g.Canvas.canvas.height),3==g.rotation&&a.drawImage(g.Canvas.canvas,0,-g.Canvas.canvas.height),0!=g.rotation&&2!=g.rotation||(g.Canvas.canvas.height=n,g.Canvas.canvas.width=o),1!=g.rotation&&3!=g.rotation||(g.Canvas.canvas.height=o,g.Canvas.canvas.width=n),g.Canvas.setTransform(1,0,0,1,0,0),g.Canvas.rotate(90*t*Math.PI/180),g.rotation=t,g.Canvas.drawImage(g.tcanvas,g.rotX(0,0),g.rotY(0,0)),g.ScreenWidth=g.Canvas.canvas.width,g.ScreenHeight=g.Canvas.canvas.height,null!=g.onScreenSizeChange&&g.onScreenSizeChange(g,g.ScreenWidth,g.ScreenHeight,g.CanvasId),!0},g.StartRecording=function(){null==g.recordedData&&g.CanvasId.toBlob(function(e){var s=new FileReader;s.readAsArrayBuffer(e),s.onload=function(e){for(var t="",n=new Uint8Array(s.result),o=n.byteLength,a=0;a<o;a++)t+=String.fromCharCode(n[a]);g.recordedData=[],g.recordedStart=Date.now(),g.recordedSize=0,g.recordedData.push(p(1,0,JSON.stringify({magic:"MeshCentralRelaySession",ver:1,time:(new Date).toLocaleString(),protocol:2}))),g.recordedData.push(p(2,1,g.shortToStr(7)+g.shortToStr(8)+g.shortToStr(g.ScreenWidth)+g.shortToStr(g.ScreenHeight)));var r=4+t.length;65e3<r?g.recordedData.push(p(2,1,g.shortToStr(27)+g.shortToStr(8)+g.intToStr(r)+g.shortToStr(3)+g.shortToStr(0)+g.shortToStr(0)+g.shortToStr(0)+t)):g.recordedData.push(p(2,1,g.shortToStr(3)+g.shortToStr(r)+g.shortToStr(0)+g.shortToStr(0)+t))}})},g.StopRecording=function(){if(null!=g.recordedData){var e=g.recordedData;return e.push(p(3,0,"MeshCentralMCREC")),delete g.recordedData,delete g.recordedStart,delete g.recordedSize,e}},g.MuchTheSame=function(e,t){return Math.abs(e-t)<4},g.Debug=function(e){console.log(e)},g.getIEVersion=function(){var e=-1;if("Microsoft Internet Explorer"==navigator.appName){var t=navigator.userAgent;null!=new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})").exec(t)&&(e=parseFloat(RegExp.$1))}return e},g.haltEvent=function(e){return e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1},g}