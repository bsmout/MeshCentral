var CreateAmtRemoteTerminal=function(e,r){var l={};l.DivId=e,l.DivElement=document.getElementById(e),l.protocol=1,r.protocol&&(l.protocol=r.protocol),l.terminalEmulation=1,l.fxEmulation=0,l.lineFeed="\r\n",l.debugmode=0,l.width=80,l.height=25,l.heightLock=0;var m,f=["000000","BB0000","00BB00","BBBB00","0000BB","BB00BB","00BBBB","BBBBBB","555555","FF5555","55FF55","FFFF55","5555FF","FF55FF","55FFFF","FFFFFF"],u=0,g=7,w=0,C=!0,S=0,T=0,a=0,h=0,o=0,c=[],s=0,d=0,b=[],k=[],n=!1,v=!0,p=!1,y=[],t="";l.title=null,l.onTitleChange=null,l.Start=function(){},l.Init=function(e,r){l.width=e||80,l.height=r||25;for(var t=0;t<l.height;t++){k[t]=[],b[t]=[];for(var i=0;i<l.width;i++)k[t][i]=" ",b[t][i]=448}l.TermInit(),l.TermDraw()},l.xxStateChange=function(e){},l.ProcessData=function(r){if(2==l.debugmode&&console.log("TRecv("+r.length+"): "+rstr2hex(r)),0==l.terminalEmulation)try{r=decode_utf8(t+r)}catch(e){return void(t+=r)}t="",null!=l.capture&&(l.capture+=r),function(e){for(var r=0;r<e.length;r++)!function(e,r){switch(o){case 0:27===r?(o=1,c=[],d=s=0):B(e);break;case 1:switch(e){case"[":o=2;break;case"(":o=4;break;case")":o=5;break;case"]":o=6;break;case"=":p=!0,o=0;break;case">":p=!1,o=0;break;case"7":a=S,h=T,o=0;break;case"8":S=a,T=h,o=0;break;case"M":for(var t=m[1];t>=m[0]+1;t--)for(var i=0;i<l.width;i++)k[t][i]=k[t-1][i],b[t][i]=b[t-1][i];for(t=m[0]+1-1;t>m[0]-1;t--)for(i=0;i<l.width;i++)k[t][i]=" ",b[t][i]=448;o=0;break;default:console.log("unknown terminal short code",e),o=0}break;case 2:if("0"<=e&&e<="9"){c[s]?c[s]=10*c[s]+(e-"0"):c[s]=e-"0";break}if(";"==e){s++;break}if("?"==e){d=1;break}c[0]||(c[0]=0),function(e,r,t,i){if(1==i)switch(e){case"l":25==r[0]&&(v=!1);break;case"h":25==r[0]&&(v=!0)}else if(0==i){var n,a;switch(e){case"c":l.TermResetScreen();break;case"A":1==t&&(0==r[0]?T--:T-=r[0],T<0&&(T=0));break;case"B":1==t&&(0==r[0]?T++:T+=r[0],T>l.height&&(T=l.height));break;case"C":1==t&&(0==r[0]?S++:S+=r[0],S>l.width&&(S=l.width));break;case"D":1==t&&(0==r[0]?S--:S-=r[0],S<0&&(S=0));break;case"d":1==t&&((T=r[0]-1)>l.height&&(T=l.height),T<0&&(T=0));break;case"G":1==t&&((S=r[0]-1)<0&&(S=0),S>l.width-1&&(S=l.width-1));break;case"P":var h=1;for(1==t&&(h=r[0]),n=S;n<l.width-h;n++)k[T][n]=k[T][n+h],b[T][n]=b[T][n+h];for(n=l.width-h;n<l.width;n++)k[T][n]=" ",b[T][n]=448;break;case"L":var o=1;for(1==t&&(o=r[0]),0==o&&(o=1),c=m[1];T+o<=c;c--)k[c]=k[c-o],b[c]=b[c-o];for(c=T;c<T+o;c++)for(k[c]=[],b[c]=[],h=0;h<l.width;h++)k[c][h]=" ",b[c][h]=448;break;case"J":if(1==t&&2==r[0])l.TermClear((w<<12)+(g<<6)),T=S=0,y=[];else if(0==t||1==t&&0==r[0])for(E(),n=T+1;n<l.height;n++)L(n);else if(1==t&&1==r[0])for(E(),n=0;n<T-1;n++)L(n);break;case"H":S=2==t?(r[0]<1&&(r[0]=1),r[1]<1&&(r[1]=1),r[0]>l.height&&(r[0]=l.height),r[1]>l.width&&(r[1]=l.width),T=r[0]-1,r[1]-1):T=0;break;case"m":for(n=0;n<t;n++){r[n]&&0!=r[n]?1==r[n]?g<8&&(g+=8):2==r[n]||22==r[n]?8<=g&&(g-=8):7==r[n]?u=2:27==r[n]?u=0:30<=r[n]&&r[n]<=37?(a=8<=g,g=r[n]-30,a&&g<=8&&(g+=8)):40<=r[n]&&r[n]<=47?w=r[n]-40:90<=r[n]&&r[n]<=99?g=r[n]-82:100<=r[n]&&r[n]<=109&&(w=r[n]-92):(g=7,u=w=0)}break;case"K":0!=t&&(1!=t||r[0]&&0!=r[0])?1==t&&(1==r[0]?function(){for(var e=(g<<6)+(w<<12)+u,r=0;r<S;r++)k[T][r]=" ",b[T][r]=e}():2==r[0]&&L(T)):E();break;case"h":C=!0;break;case"l":C=!1;break;case"r":2==t&&(m=[r[0]-1,r[1]-1]),m[0]<0&&(m[0]=0),m[0]>l.height-1&&(m[0]=l.height-1),m[1]<0&&(m[1]=0),m[1]>l.height-1&&(m[1]=l.height-1),m[0]>m[1]&&(m[0]=m[1]);break;case"S":h=1;1==t&&(h=r[0]);for(var c=m[0];c<=m[1]-h;c++)for(var f=0;f<l.width;f++)k[c][f]=k[c+h][f],b[c][f]=b[c+h][f];for(c=m[1]-h+1;c<m[1];c++)for(f=0;f<l.width;f++)k[c][f]=" ",b[c][f]=448;break;case"M":h=1;1==t&&(h=r[0]);for(c=T;c<=m[1]-h;c++)for(f=0;f<l.width;f++)k[c][f]=k[c+h][f],b[c][f]=b[c+h][f];for(c=m[1]-h+1;c<m[1];c++)for(f=0;f<l.width;f++)k[c][f]=" ",b[c][f]=448;break;case"T":h=1;1==t&&(h=r[0]);for(c=m[1];c>m[0]+h;c--)for(f=0;f<l.width;f++)k[c][f]=k[c-h][f],b[c][f]=b[c-h][f];for(c=m[0]+h;c>m[0];c--)for(f=0;f<l.width;f++)k[c][f]=" ",b[c][f]=448;break;case"X":var h=1,s=S,d=T;for(1==t&&(h=r[0]);0<h&&d<l.height;)k[d][s]=" ",h--,++s>=l.width&&(s=0,d++);break;default:console.log("Unknown terminal code",e,r,i)}}}(e,c,s+1,d),o=0;break;case 4:case 5:o=0;break;case 6:var n=e.charCodeAt(0);";"==e?s++:7==n?(function(e){if(0==e.length)return;var r=parseInt(e[0]);(0==r||2==r)&&1<e.length&&"?"!=e[1]&&l.onTitleChange&&l.onTitleChange(l,l.title=e[1])}(c),o=0):c[s]?c[s]+=e:c[s]=e}}(String.fromCharCode(e.charCodeAt(r)),e.charCodeAt(r))}(r),l.TermDraw()},l.ProcessVt100String=function(e){for(var r=0;r<e.length;r++)B(String.fromCharCode(e.charCodeAt(r)))};var K=[199,252,233,226,228,224,229,231,234,235,232,239,238,236,196,197,201,230,198,244,246,242,251,249,255,214,220,162,163,165,8359,402,225,237,243,250,241,209,170,218,191,8976,172,189,188,161,171,187,9619,9618,9617,9474,9508,9569,9570,9558,9557,9571,9553,9559,9565,9564,9563,9488,9492,9524,9516,9500,9472,9532,9566,9567,9562,9556,9577,9574,9568,9552,9580,9575,9576,9572,9573,9576,9560,9554,9555,9579,9578,9496,9484,9608,9604,9611,9616,9600,945,223,915,960,931,963,181,964,966,952,8486,948,8734,248,949,8719,8801,177,8805,8806,8992,8993,247,8776,176,8226,183,8730,8319,178,8718,160],D=[199,252,233,226,228,224,229,231,234,235,232,239,238,236,196,197,201,230,198,244,246,242,251,249,255,214,220,162,163,165,8359,402,225,237,243,250,241,209,170,218,191,8976,172,189,188,161,174,187,9619,9618,9617,9474,9508,9569,9570,9558,9557,9571,9553,9559,9565,9564,9563,9488,9492,9524,9516,9500,9472,9532,9566,9567,9562,9556,9577,9574,9568,9552,9580,9575,9576,9572,9573,9576,9560,9554,9555,9579,9578,9496,9484,9608,9604,9611,9616,9600,945,223,915,960,931,963,181,964,966,952,8486,948,8734,248,949,8719,8801,177,8805,8806,8992,8993,247,8776,176,8226,183,8730,8319,178,8718,160],K=[199,252,233,226,228,224,229,231,234,235,232,239,238,236,196,197,201,230,198,244,246,242,251,249,255,214,220,162,163,165,8359,402,225,237,243,250,241,209,170,218,191,8976,172,189,188,161,171,187,9619,9618,9617,9474,9508,9569,9570,9558,9557,9571,9553,9559,9565,9564,9563,9488,9492,9524,9516,9500,9472,9532,9566,9567,9562,9556,9577,9574,9568,9552,9580,9575,9576,9572,9573,9576,9560,9554,9555,9579,9578,9496,9484,9608,9604,9611,9616,9600,945,223,915,960,931,963,181,964,966,952,8486,948,8734,248,949,8719,8801,177,8805,8806,8992,8993,247,8776,176,8226,183,8730,8319,178,8718,160],D=[199,252,233,226,228,224,229,231,234,235,232,239,238,236,196,197,201,230,198,244,246,242,251,249,255,214,220,162,163,165,8359,402,225,237,243,250,241,209,170,218,191,8976,172,189,188,161,174,187,9619,9618,9617,9474,9508,9569,9570,9558,9557,9571,9553,9559,9565,9564,9563,9488,9492,9524,9516,9500,9472,9532,9566,9567,9562,9556,9577,9574,9568,9552,9580,9575,9576,9572,9573,9576,9560,9554,9555,9579,9578,9496,9484,9608,9604,9611,9616,9600,945,223,915,960,931,963,181,964,966,952,8486,948,8734,248,949,8719,8801,177,8805,8806,8992,8993,247,8776,176,8226,183,8730,8319,178,8718,160];function B(e){if("\0"!=e&&7!=e.charCodeAt()){var r=e.charCodeAt();switch(1==l.terminalEmulation?0!=(128&r)&&(e=String.fromCharCode(K[127&r])):2==l.terminalEmulation&&0!=(128&r)&&(e=String.fromCharCode(D[127&r])),r){case 16:e=" ";break;case 24:e="↑";break;case 25:e="↓"}switch(S>l.width&&(S=l.width),T>l.height-1&&(T=l.height-1),e){case"\b":0<S&&(S--,n&&F(" "));break;case"\t":for(var t=8-S%8,i=0;i<t;i++)B(" ");break;case"\n":++T>m[1]&&(l.recordLineTobackBuffer(0),P(1),T=m[1]),l.lineFeed="\r",S=0;break;case"\r":S=0;break;default:S>=l.width&&(S=0,C&&T++,T>=l.height-1&&(P(1),T=l.height-1)),F(e),S++}}}function F(e){k[T][S]=e,b[T][S]=(g<<6)+(w<<12)+u}function E(){for(var e=(g<<6)+(w<<12)+u,r=S;r<l.width;r++)k[T][r]=" ",b[T][r]=e}function L(e){for(var r=(g<<6)+(w<<12)+u,t=0;t<l.width;t++)k[e][t]=" ",b[e][t]=r}function P(e){for(var r,t=m[0];t<=m[1]-e;t++)k[t]=k[t+e],b[t]=b[t+e];for(t=m[1]-e+1;t<=m[1];t++)for(k[t]=[],b[t]=[],r=0;r<l.width;r++)k[t][r]=" ",b[t][r]=448}return l.TermClear=function(e){for(var r=0;r<l.height;r++)for(var t=0;t<l.width;t++)k[r][t]=" ",b[r][t]=e;y=[]},l.TermResetScreen=function(){C=v=!(w=u=0),S=T=0,n=!(g=7),m=[0,l.height-1],p=!1,l.TermClear(448),t=""},l.TermSendKeys=function(e){2==l.debugmode&&console.log("TSend("+e.length+"): "+rstr2hex(e),e),l.parent.send(e)},l.TermSendKey=function(e){2==l.debugmode&&console.log("TSend(1): "+rstr2hex(String.fromCharCode(e)),e),l.parent.send(String.fromCharCode(e))},l.TermHandleKeys=function(e){if(!e.ctrlKey)return 127==e.which?l.TermSendKey(8):13==e.which?l.TermSendKeys(l.lineFeed):0!=e.which&&l.TermSendKey(e.which),!1;e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation()},l.TermHandleKeyUp=function(e){return 8!=e.which&&32!=e.which&&9!=e.which||(e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1)},l.TermHandleKeyDown=function(e){if(65<=e.which&&e.which<=90&&1==e.ctrlKey)return l.TermSendKey(e.which-64),e.preventDefault&&e.preventDefault(),void(e.stopPropagation&&e.stopPropagation());if(27==e.which)return l.TermSendKeys(String.fromCharCode(27)),!0;if(1==p){if(37==e.which)return l.TermSendKeys(String.fromCharCode(27,79,68)),!0;if(38==e.which)return l.TermSendKeys(String.fromCharCode(27,79,65)),!0;if(39==e.which)return l.TermSendKeys(String.fromCharCode(27,79,67)),!0;if(40==e.which)return l.TermSendKeys(String.fromCharCode(27,79,66)),!0}else{if(37==e.which)return l.TermSendKeys(String.fromCharCode(27,91,68)),!0;if(38==e.which)return l.TermSendKeys(String.fromCharCode(27,91,65)),!0;if(39==e.which)return l.TermSendKeys(String.fromCharCode(27,91,67)),!0;if(40==e.which)return l.TermSendKeys(String.fromCharCode(27,91,66)),!0}if(33==e.which)return l.TermSendKeys(String.fromCharCode(27,91,53,126)),!0;if(34==e.which)return l.TermSendKeys(String.fromCharCode(27,91,54,126)),!0;if(35==e.which)return l.TermSendKeys(String.fromCharCode(27,91,70)),!0;if(36==e.which)return l.TermSendKeys(String.fromCharCode(27,91,72)),!0;if(45==e.which)return l.TermSendKeys(String.fromCharCode(27,91,50,126)),!0;if(46==e.which)return l.TermSendKeys(String.fromCharCode(27,91,51,126)),!0;if(9==e.which)return l.TermSendKeys("\t"),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!0;var r=[80,81,119,120,116,117,113,114,112,77],t=[49,50,51,52,53,54,55,56,57,48,33,64],i=[80,81,82,83,84,85,86,87,88,89,90,91];if(111<e.which&e.which<124&&0==e.repeat){if(0==l.fxEmulation&&e.which<122)return l.TermSendKeys(String.fromCharCode(27,91,79,r[e.which-112])),!0;if(1==l.fxEmulation)return l.TermSendKeys(String.fromCharCode(27,t[e.which-112])),!0;if(2==l.fxEmulation)return l.TermSendKeys(String.fromCharCode(27,79,i[e.which-112])),!0}r=[80,81,119,120,116,117,113,114,112,77];if(111<e.which&e.which<122&&0==e.repeat)return l.TermSendKeys(String.fromCharCode(27,91,79,r[e.which-112])),!0;t=[49,50,51,52,53,54,55,56,57,48,33,64];if(111<e.which&e.which<124&&0==e.repeat)return l.TermSendKeys(String.fromCharCode(27,t[e.which-112])),!0;i=[80,81,82,83,84,85,86,87,88,89,90,91];return 111<e.which&e.which<124&&0==e.repeat?(l.TermSendKeys(String.fromCharCode(27,79,i[e.which-112])),!0):8!=e.which&&32!=e.which&&9!=e.which||(l.TermSendKey(e.which),e.preventDefault&&e.preventDefault(),e.stopPropagation&&e.stopPropagation(),!1)},l.recordLineTobackBuffer=function(e){var r=l.TermDrawLine("",e,""),t=r[0],i=r[1];y.push(t+i+"<br>")},l.TermDrawLine=function(e,r,t){for(var i,n,a,h,o=1,c=0;c<l.width;++c)switch(i=b[r][c],S==c&&T==r&&v&&(i|=2),i!=o&&(e+=t,a=6,h=12,2&i&&(a=12,h=6),e+='<span style="color:#'+f[i>>a&63]+";background-color:#"+f[i>>h&63],1&i&&(e+=";text-decoration:underline"),e+=';">',t="</span>"+(t=""),o=i),n=k[r][c]){case"&":e+="&amp;";break;case"<":e+="&lt;";break;case">":e+="&gt;";break;case" ":e+="&nbsp;";break;default:e+=n}return[e,t]},l.TermDraw=function(){for(var e="",r="",t=0;t<l.height;++t){var i=l.TermDrawLine(r,t,e),r=i[0],e=i[1];t!=l.height-1&&(r+="<br>")}800<y.length&&(y=y.slice(y.length-800));var n=y.join("");l.DivElement.innerHTML="<font size='4'><b>"+n+r+e+"</b></font>",l.DivElement.scrollTop=l.DivElement.scrollHeight,0==l.heightLock&&setTimeout(l.TermLockHeight,10)},l.TermLockHeight=function(){l.heightLock=l.DivElement.clientHeight,l.DivElement.style.height=l.DivElement.parentNode.style.height=l.heightLock+"px",l.DivElement.style["overflow-y"]="scroll"},l.TermInit=function(){l.TermResetScreen()},l.heightLock=0,l.DivElement.style.height="",null!=r&&null!=r.cols&&null!=r.rows?l.Init(r.cols,r.rows):l.Init(),l}