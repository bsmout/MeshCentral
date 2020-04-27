/**
* @description MeshCentral remote desktop multiplexor
* @author Ylian Saint-Hilaire
* @copyright Intel Corporation 2018-2020
* @license Apache-2.0
* @version v0.0.1
*/

/*jslint node: true */
/*jshint node: true */
/*jshint strict:false */
/*jshint -W097 */
/*jshint esversion: 6 */
"use strict";


/*
--- KVM Commands ---
MNG_KVM_NOP = 0,
MNG_KVM_KEY = 1,
MNG_KVM_MOUSE = 2,
MNG_KVM_MOUSE_CURSOR = 88,
MNG_KVM_MOUSE_MOVE = 89,
MNG_KVM_PICTURE = 3,
MNG_KVM_COPY = 4,
MNG_KVM_COMPRESSION = 5,
MNG_KVM_REFRESH = 6,
MNG_KVM_SCREEN = 7,
MNG_KVM_PAUSE = 8,
MNG_TERMTEXT = 9,
MNG_CTRLALTDEL = 10,
MNG_KVM_GET_DISPLAYS = 11,
MNG_KVM_SET_DISPLAY = 12,
MNG_KVM_FRAME_RATE_TIMER = 13,
MNG_KVM_INIT_TOUCH = 14,
MNG_KVM_TOUCH = 15,
MNG_KVM_CONNECTCOUNT = 16,
MNG_KVM_MESSAGE = 17,
MNG_ECHO = 21,
MNG_JUMBO = 27,
MNG_GETDIR = 50,
MNG_FILEMOVE = 51,
MNG_FILEDELETE = 52,
MNG_FILECOPY = 53,
MNG_FILECREATEDIR = 54,
MNG_FILETRANSFER = 55,
MNG_FILEUPLOAD = 56,
MNG_FILESEARCH = 57,
MNG_FILETRANSFER2 = 58,
MNG_KVM_DISCONNECT = 59,
MNG_GETDIR2 = 60,						// Same as MNG_GETDIR but with date/time.
MNG_FILEUPLOAD2 = 61,					// Used for slot based fast upload.
MNG_FILEDELETEREC = 62,					// Same as MNG_FILEDELETE but recursive
MNG_USERCONSENT = 63,					// Used to notify management console of user consent state
MNG_DEBUG = 64,							// Debug/Logging Message for ILibRemoteLogging
MNG_ERROR = 65,
MNG_ENCAPSULATE_AGENT_COMMAND = 70
*/

function CreateDesktopDecoder() {
    var obj = {};
    obj.agent = null;                   // Reference to the connection object that is the agent.
    obj.viewers = [];                   // Array of references to all viewers.
    obj.viewersSendingCount = 0;        // Number of viewers currently activaly sending something.
    obj.width = 0;                      // Current width of the display in pixels.
    obj.height = 0;                     // Current height of the display in pixels.
    obj.swidth = 0;                     // Current width of the display in tiles.
    obj.sheight = 0;                    // Current height of the display in tiles.
    obj.screen = null;                  // The main screen, (x * y) --> tile index. Indicates this image is covering each tile on the screen.
    obj.counter = 1;                    // The main counter, used as index for the obj.images table when now images come in.
    obj.imagesCount = 0;                // Total number of images in the obj.images table.
    obj.imagesCounters = {};            // Main table of indexes --> tile count, the number of tiles still using this image.
    obj.images = {};                    // Main table of indexes --> image data object.
    obj.lastScreenSizeCmd = null;       // Pointer to the last screen size command from the agent.
    obj.lastScreenSizeCounter = 0;      // Index into the image table of the screen size command, this is generally also the first command.
    obj.firstData = null;               // Index in the image table of the first image in the table, generally this points to the display resolution command.
    obj.lastData = null;                // Index in the images table of the last image in the table.
    obj.lastDisplayInfoData = null;     // Pointer to the last display information command from the agent (Number of displays).
    obj.desktopPaused = true;           // Current desktop pause state, it's true if all viewers are paused.
    obj.imageCompression = 50;          // Current image compression, this is the highest value of all viewers.
    obj.imageScaling = 1024;            // Current image scaling, this is the highest value of all viewers.
    obj.imageFrameRate = 50;            // Current framerate setting, this is the lowest values of all viewers.
    obj.protocolOptions = null;         // Set to the protocol options of the first viewer that connected.
    obj.viewerConnected = false;        // Set to true if one viewer attempted to connect to the agent.

    // Add an agent or viewer
    obj.addPeer = function (peer) {
        if (peer.req.query.browser) {
            console.log('addPeer-viewer');
            
            // This is a viewer
            if (obj.viewers.indexOf(peer) >= 0) return true;
            obj.viewers.push(peer);
            
            // Setup the viewer
            peer.desktopPaused = true;
            peer.imageCompression = 30;
            peer.imageScaling = 1024;
            peer.imageFrameRate = 100;
            peer.lastImageNumberSent = null;
            peer.dataPtr = obj.firstData;
            peer.sending = false;
            peer.sendQueue = [];
        } else {
            console.log('addPeer-agent');
            if (obj.agent != null) return false;
            
            // This is the agent
            obj.agent = peer;

            // Setup the agent
            peer.sending = false;
            peer.sendQueue = [];
            //peer.ws.send('{"tsid":10,"type":"options"}');
            //peer.ws.send('2');

            if (obj.viewerConnected == true) {
                if (obj.protocolOptions != null) { obj.sendToAgent(JSON.stringify(obj.protocolOptions)); } // Send connection options
                obj.sendToAgent('2'); // Send remote desktop connect
            }
        }
        return true;
    }

    // Remove an agent or viewer
    obj.removePeer = function (peer) {
        if (peer == agent) {
            console.log('removePeer-agent');
            // Clean up the agent

            // Agent has disconnected, disconnect everyone.
        } else {
            console.log('removePeer-viewer');
            // Remove a viewer
            var i = obj.viewers.indexOf(peer);
            if (i == -1) return false;
            obj.viewers.splice(i, 1);

            // Clean up the viewer
            
        }
        return true;
    }

    // Send data to the agent or queue it up for sending
    obj.sendToAgent = function (data) {
        if (obj.agent == null) return;
        //console.log('SendToAgent', data.length);
        if (obj.agent.sending) {
            obj.agent.sendQueue.push(data);
            // TODO: Flow control, stop all viewers
        } else {
            obj.agent.ws.send(data, sendAgentNext);
        }
    }

    // Send more data to the agent
    function sendAgentNext() {
        if (obj.agent.sendQueue.length > 0) {
            // Send from the pending send queue
            obj.agent.ws.send(obj.agent.sendQueue.shift(), sendAgentNext);
        } else {
            // Nothing to send
            obj.agent.sending = false;
            // TODO: Flow control, start all viewers
        }
    }

    // Send this command to all viewers
    obj.sendToAllViewers = function (data) {
        for (var i in obj.viewers) { obj.sendToViewer(obj.viewers[i], data); }
    }

    // Send data to the viewer or queue it up for sending
    obj.sendToViewer = function (viewer, data) {
        if (viewer == null) return;
        //console.log('SendToViewer', data.length);
        if (viewer.sending) {
            viewer.sendQueue.push(data);
            // TODO: Flow control, stop the agent
        } else {
            viewer.sending = true;
            obj.viewersSendingCount++;
            viewer.ws.send(data, function () { sendViewerNext(viewer); });
        }
    }

    // Send more data to the viewer
    function sendViewerNext(viewer) {
        if (viewer.sendQueue.length > 0) {
            // Send from the pending send queue
            if (viewer.sending == false) { viewer.sending = true; obj.viewersSendingCount++; }
            viewer.ws.send(viewer.sendQueue.shift(), function () { sendViewerNext(viewer); });
        } else {
            if (viewer.dataPtr != null) {
                // Send the next image
                if ((viewer.lastImageNumberSent != null) && ((viewer.lastImageNumberSent + 1) != (viewer.dataPtr))) { console.log('SVIEW-S1', viewer.lastImageNumberSent, viewer.dataPtr); } // DEBUG
                var image = obj.images[viewer.dataPtr];
                viewer.lastImageNumberSent = viewer.dataPtr;
                if ((image.next != null) && ((viewer.dataPtr + 1) != image.next)) { console.log('SVIEW-S2', viewer.dataPtr, image.next); } // DEBUG
                viewer.dataPtr = image.next;
                if (viewer.sending == false) { viewer.sending = true; obj.viewersSendingCount++; }
                viewer.ws.send(image.data, function () { sendViewerNext(viewer); });
            } else {
                // Nothing to send
                viewer.sending = false;
                obj.viewersSendingCount--;
                // TODO: Flow control, start agent
            }
        }
    }

    // Process data coming from the agent or any viewers
    obj.processData = function (peer, data) {
        if (peer == obj.agent) { obj.processAgentData(data); } else { obj.processViewerData(peer, data); }
    }

    // Process incoming viewer data
    obj.processViewerData = function (viewer, data) {
        if (typeof data == 'string') {
            if (data == '2') {
                if (obj.viewerConnected == false) {
                    if (obj.agent != null) {
                        if (obj.protocolOptions != null) { obj.sendToAgent(JSON.stringify(obj.protocolOptions)); } // Send connection options
                        obj.sendToAgent('2'); // Send remote desktop connect
                    }
                    obj.viewerConnected = true;
                }
                return;
            }
            var json = null;
            try { json = JSON.parse(data); } catch (ex) { }
            if (json == null) return;
            if ((json.type == 'options') && (obj.protocolOptions == null)) { obj.protocolOptions = json; }
            return;
        }

        //console.log('ViewerData', data.length, typeof data, data);
        if ((typeof data != 'object') || (data.length < 4)) return; // Ignore all control traffic for now (WebRTC)
        var command = data.readUInt16BE(0);
        var cmdsize = data.readUInt16BE(2);
        //console.log('ViewerData', data.length, command, cmdsize);
        switch (command) {
            case 1:// Key Events, forward to agent
                //console.log('Viewer-Keys');
                obj.sendToAgent(data);
                break;
            case 2:// Mouse events, forward to agent
                //console.log('Viewer-Mouse');
                obj.sendToAgent(data);
                break;
            case 5:// Compression
                if (data.length < 10) return;
                //viewer.imageType = data[4]; // Always 1=JPEG
                viewer.imageCompression = data[5];
                viewer.imageScaling = data.readUInt16BE(6);
                viewer.imageFrameRate = data.readUInt16BE(8);
                //console.log('Viewer-Compression', viewer.imageCompression, viewer.imageScaling, viewer.imageFrameRate);
                
                // See if this changes anything
                var viewersimageCompression = null;
                var viewersimageScaling = null;
                var viewersimageFrameRate = null;
                for (var i in obj.viewers) {
                    if ((viewersimageCompression == null) || (obj.viewers[i].imageCompression > viewersimageCompression)) { viewersimageCompression = obj.viewers[i].imageCompression; };
                    if ((viewersimageScaling == null) || (obj.viewers[i].imageScaling > viewersimageScaling)) { viewersimageScaling = obj.viewers[i].imageScaling; };
                    if ((viewersimageFrameRate == null) || (obj.viewers[i].imageFrameRate < viewersimageFrameRate)) { viewersimageFrameRate = obj.viewers[i].imageFrameRate; };
                }
                if ((obj.imageCompression != viewersimageCompression) || (obj.imageScaling != viewersimageScaling) || (obj.imageFrameRate != viewersimageFrameRate)) {
                    // Update and send to agent new compression settings
                    obj.imageCompression = viewersimageCompression;
                    obj.imageScaling = viewersimageScaling;
                    obj.imageFrameRate = viewersimageFrameRate
                    //console.log('Send-Agent-Compression', obj.imageCompression, obj.imageScaling, obj.imageFrameRate);
                    var cmd = Buffer.alloc(10);
                    cmd.writeUInt16BE(5, 0); // Command 5, compression
                    cmd.writeUInt16BE(10, 2); // Command size, 10 bytes long
                    cmd[4] = 1; // Image type, 1 = JPEN
                    cmd[5] = obj.imageCompression; // Image compression level
                    cmd.writeUInt16BE(obj.imageScaling, 6); // Scaling level
                    cmd.writeUInt16BE(obj.imageFrameRate, 8); // Frame rate timer
                    obj.sendToAgent(cmd);
                }
                break;
            case 6:// Refresh, handle this on the server
                //console.log('Viewer-Refresh');
                viewer.dataPtr = obj.firstData; // Start over
                if (viewer.sending == false) { sendViewerNext(viewer); }
                break;
            case 8:// Pause and unpause
                if (data.length != 5) break;
                var pause = data[4]; // 0 = Unpause, 1 = Pause
                if (viewer.desktopPaused == (pause == 1)) break;
                viewer.desktopPaused = (pause == 1);
                //console.log('Viewer-' + ((pause == 1)?'Pause':'UnPause'));
                var viewersPaused = true;
                for (var i in obj.viewers) { if (obj.viewers[i].desktopPaused == false) { viewersPaused = false; }; }
                if (viewersPaused != obj.desktopPaused) {
                    obj.desktopPaused = viewersPaused;
                    //console.log('Send-Agent-' + ((viewersPaused == true) ? 'Pause' : 'UnPause'));
                    data[4] = (viewersPaused == true) ? 1 : 0;
                    obj.sendToAgent(data);
                }
                break;
            case 10:// CTRL-ALT-DEL, forward to agent
                obj.sendToAgent(data);
                break;
            case 14:// Touch setup
                break;
            default:
                console.log('Un-handled viewer command: ' + command);
                break;
        }
    }

    // Process incoming agent data
    obj.processAgentData = function (data) {
        if ((typeof data != 'object') || (data.length < 4)) return; // Ignore all control traffic for now (WebRTC)
        const jumboData = data;
        var command = data.readUInt16BE(0);
        var cmdsize = data.readUInt16BE(2);
        //console.log('AgentData', data.length, command, cmdsize);
        if ((command == 27) && (cmdsize == 8)) {
            // Jumbo packet
            if (data.length >= 12) {
                command = data.readUInt16BE(8);
                cmdsize = data.readUInt32BE(4);
                if (data.length == (cmdsize + 8)) {
                    data = data.slice(8, data.length);
                } else {
                    console.log('TODO-PARTIAL-JUMBO', command, cmdsize, data.length);
                    return; // TODO
                }
            }
        }
            
        switch (command) {
            case 3: // Tile, check dimentions and store
                var x = data.readUInt16BE(4), y = data.readUInt16BE(6);
                var dimensions = require('image-size')(data.slice(8));
                var sx = (x / 16), sy = (y / 16), sw = (dimensions.width / 16), sh = (dimensions.height / 16);
                obj.counter++;
                //console.log("Tile", x, y, dimensions.width, dimensions.height);
                
                // Keep a reference to this image & how many tiles it covers
                obj.images[obj.counter] = { next: null, prev: obj.lastData, data: jumboData };
                obj.images[obj.lastData].next = obj.counter;
                obj.lastData = obj.counter;
                obj.imagesCounters[obj.counter] = (sw * sh);
                obj.imagesCount++;
                if (obj.imagesCount == 2000000000) { obj.imagesCount = 1; } // Loop the counter if needed

                //console.log('Adding Image ' + obj.counter);

                var skips = [];

                // Update the screen with the correct pointers.
                for (var i = 0; i < sw; i++) {
                    for (var j = 0; j < sh; j++) {
                        var k = ((obj.swidth * (j + sy)) + (i + sx));
                        const oi = obj.screen[k];
                        obj.screen[k] = obj.counter;
                        if ((oi != null) && (--obj.imagesCounters[oi] == 0)) {
                            // Remove data from the link list
                            obj.imagesCount--;
                            var d = obj.images[oi];
                            //console.log('Removing Image', oi, obj.images[oi].prev, obj.images[oi].next);
                            obj.images[d.prev].next = d.next;
                            obj.images[d.next].prev = d.prev;
                            delete obj.images[oi];
                            delete obj.imagesCounters[oi];

                            // If any viewers are currently on image "oi" must be moved to "d.next"
                            for (var l in obj.viewers) { const v = obj.viewers[l]; if (v.dataPtr == oi) { skips.push(oi); v.dataPtr = d.next; } }
                        }
                    }
                }

                if (skips.length > 0) { console.log('SKIPS', skips.length); }

                // Any viewer on dataPtr null, change to this image
                for (var i in obj.viewers) {
                    const v = obj.viewers[i];
                    if (v.dataPtr == null) { v.dataPtr = obj.counter; if (v.sending == false) { sendViewerNext(v); } }
                }

                // Debug, display the link list
                //var xx = '', xptr = obj.firstData;
                //while (xptr != null) { xx += '>' + xptr; xptr = obj.images[xptr].next; }
                //console.log('list', xx);
                //console.log('images', obj.imagesCount);
                
                break;
            case 4: // Tile Copy, do nothing.
                break;
            case 7: // Screen Size, clear the screen state and compute the tile count
                obj.counter++;
                obj.lastScreenSizeCmd = data;
                obj.lastScreenSizeCounter = obj.counter;
                obj.width = data.readUInt16BE(4);
                obj.height = data.readUInt16BE(6);
                obj.swidth = obj.width / 16;
                obj.sheight = obj.height / 16;
                if (Math.floor(obj.swidth) != obj.swidth) { obj.swidth = Math.floor(obj.swidth) + 1; }
                if (Math.floor(obj.sheight) != obj.sheight) { obj.sheight = Math.floor(obj.sheight) + 1; }
                
                // Reset the display
                obj.screen = new Array(obj.swidth * obj.sheight);
                obj.imagesCount = 0;
                obj.imagesCounters = {};
                obj.images = {};
                obj.images[obj.counter] = { next: null, prev: null, data: data };
                obj.firstData = obj.counter;
                obj.lastData = obj.counter;
                
                // Add viewers must be set to start at "obj.counter"
                for (var i in obj.viewers) {
                    const v = obj.viewers[i];
                    v.dataPtr = obj.counter;
                    if (v.sending == false) { sendViewerNext(v); }
                }

                //console.log("ScreenSize", obj.width, obj.height, obj.swidth, obj.sheight, obj.swidth * obj.sheight);
                break;
            case 11: // GetDisplays
                // Store and send this to all viewers right away
                obj.lastDisplayInfoData = data;
                obj.sendToAllViewers(data);
                break;
            case 14: // KVM_INIT_TOUCH
                break;
            case 15: // KVM_TOUCH
                break;
            case 16: // MNG_KVM_CONNECTCOUNT
                break;
            case 17: // MNG_KVM_MESSAGE
                // Send this to all viewers right away
                obj.sendToAllViewers(data);
                break;
            case 65: // Alert
                // Send this to all viewers right away
                obj.sendToAllViewers(data);
                break;
            case 88: // MNG_KVM_MOUSE_CURSOR
                // Send this to all viewers right away
                obj.sendToAllViewers(data);
                break;
            default:
                console.log('Un-handled agent command: ' + command);
                break;
        }
    }

    return obj;
}

module.exports.CreateMeshRelay = function (parent, ws, req, domain, user, cookie) {
    var obj = {};
    obj.ws = ws;
    obj.ws.me = obj;
    obj.id = req.query.id;
    obj.user = user;
    obj.ruserid = null;
    obj.req = req; // Used in multi-server.js

    // Check relay authentication
    if ((user == null) && (obj.req.query != null) && (obj.req.query.rauth != null)) {
        const rcookie = parent.parent.decodeCookie(obj.req.query.rauth, parent.parent.loginCookieEncryptionKey, 240); // Cookie with 4 hour timeout
        if (rcookie.ruserid != null) { obj.ruserid = rcookie.ruserid; }
    }

    // If there is no authentication, drop this connection
    if ((obj.id != null) && (obj.id.startsWith('meshmessenger/') == false) && (obj.user == null) && (obj.ruserid == null)) { try { ws.close(); parent.parent.debug('relay', 'Relay: Connection with no authentication (' + cleanRemoteAddr(obj.req.ip) + ')'); } catch (e) { console.log(e); } return; }

    // Relay session count (we may remove this in the future)
    obj.relaySessionCounted = true;
    parent.relaySessionCount++;

    // Mesh Rights
    const MESHRIGHT_EDITMESH = 1;
    const MESHRIGHT_MANAGEUSERS = 2;
    const MESHRIGHT_MANAGECOMPUTERS = 4;
    const MESHRIGHT_REMOTECONTROL = 8;
    const MESHRIGHT_AGENTCONSOLE = 16;
    const MESHRIGHT_SERVERFILES = 32;
    const MESHRIGHT_WAKEDEVICE = 64;
    const MESHRIGHT_SETNOTES = 128;
    const MESHRIGHT_REMOTEVIEW = 256;

    // Site rights
    const SITERIGHT_SERVERBACKUP = 1;
    const SITERIGHT_MANAGEUSERS = 2;
    const SITERIGHT_SERVERRESTORE = 4;
    const SITERIGHT_FILEACCESS = 8;
    const SITERIGHT_SERVERUPDATE = 16;
    const SITERIGHT_LOCKED = 32;

    // Clean a IPv6 address that encodes a IPv4 address
    function cleanRemoteAddr(addr) { if (addr.startsWith('::ffff:')) { return addr.substring(7); } else { return addr; } }

    // Disconnect this agent
    obj.close = function (arg) {
        if ((arg == 1) || (arg == null)) { try { ws.close(); parent.parent.debug('relay', 'Relay: Soft disconnect (' + cleanRemoteAddr(obj.req.ip) + ')'); } catch (e) { console.log(e); } } // Soft close, close the websocket
        if (arg == 2) { try { ws._socket._parent.end(); parent.parent.debug('relay', 'Relay: Hard disconnect (' + cleanRemoteAddr(obj.req.ip) + ')'); } catch (e) { console.log(e); } } // Hard close, close the TCP socket

        // Aggressive cleanup
        delete obj.id;
        delete obj.ws;
        delete obj.peer;
    };

    obj.sendAgentMessage = function (command, userid, domainid) {
        var rights, mesh;
        if (command.nodeid == null) return false;
        var user = parent.users[userid];
        if (user == null) return false;
        var splitnodeid = command.nodeid.split('/');
        // Check that we are in the same domain and the user has rights over this node.
        if ((splitnodeid[0] == 'node') && (splitnodeid[1] == domainid)) {
            // Get the user object
            // See if the node is connected
            var agent = parent.wsagents[command.nodeid];
            if (agent != null) {
                // Check if we have permission to send a message to that node
                rights = parent.GetNodeRights(user, agent.dbMeshKey, agent.dbNodeKey);
                mesh = parent.meshes[agent.dbMeshKey];
                if ((rights != null) && (mesh != null) || ((rights & 16) != 0)) { // TODO: 16 is console permission, may need more gradular permission checking
                    if (ws.sessionId) { command.sessionid = ws.sessionId; }   // Set the session id, required for responses.
                    command.rights = rights.rights;     // Add user rights flags to the message
                    command.consent = mesh.consent;     // Add user consent
                    if (typeof domain.userconsentflags == 'number') { command.consent |= domain.userconsentflags; } // Add server required consent flags
                    command.username = user.name;       // Add user name
                    if (typeof domain.desktopprivacybartext == 'string') { command.privacybartext = domain.desktopprivacybartext; } // Privacy bar text
                    delete command.nodeid;              // Remove the nodeid since it's implyed.
                    agent.send(JSON.stringify(command));
                    return true;
                }
            } else {
                // Check if a peer server is connected to this agent
                var routing = parent.parent.GetRoutingServerId(command.nodeid, 1); // 1 = MeshAgent routing type
                if (routing != null) {
                    // Check if we have permission to send a message to that node
                    rights = parent.GetNodeRights(user, routing.meshid, command.nodeid);
                    mesh = parent.meshes[routing.meshid];
                    if (rights != null || ((rights & 16) != 0)) { // TODO: 16 is console permission, may need more gradular permission checking
                        if (ws.sessionId) { command.fromSessionid = ws.sessionId; }   // Set the session id, required for responses.
                        command.rights = rights.rights;         // Add user rights flags to the message
                        command.consent = mesh.consent;         // Add user consent
                        if (typeof domain.userconsentflags == 'number') { command.consent |= domain.userconsentflags; } // Add server required consent flags
                        command.username = user.name;           // Add user name
                        if (typeof domain.desktopprivacybartext == 'string') { command.privacybartext = domain.desktopprivacybartext; } // Privacy bar text
                        parent.parent.multiServer.DispatchMessageSingleServer(command, routing.serverid);
                        return true;
                    }
                }
            }
        }
        return false;
    };

    // Send a PING/PONG message
    function sendPing() {
        try { obj.ws.send('{"ctrlChannel":"102938","type":"ping"}'); } catch (ex) { }
        try { if (obj.peer != null) { obj.peer.ws.send('{"ctrlChannel":"102938","type":"ping"}'); } } catch (ex) { }
    }
    function sendPong() {
        try { obj.ws.send('{"ctrlChannel":"102938","type":"pong"}'); } catch (ex) { }
        try { if (obj.peer != null) { obj.peer.ws.send('{"ctrlChannel":"102938","type":"pong"}'); } } catch (ex) { }
    }

    function performRelay() {
        if (obj.id == null) { try { obj.close(); } catch (e) { } return null; } // Attempt to connect without id, drop this.
        ws._socket.setKeepAlive(true, 240000); // Set TCP keep alive

        // If this is a MeshMessenger session, the ID is the two userid's and authentication must match one of them.
        if (obj.id.startsWith('meshmessenger/')) {
            if ((obj.id.startsWith('meshmessenger/user/') == true) && (user == null)) { try { obj.close(); } catch (e) { } return null; } // If user-to-user, both sides need to be authenticated.
            var x = obj.id.split('/'), user1 = x[1] + '/' + x[2] + '/' + x[3], user2 = x[4] + '/' + x[5] + '/' + x[6];
            if ((x[1] != 'user') && (x[4] != 'user')) { try { obj.close(); } catch (e) { } return null; } // MeshMessenger session must have at least one authenticated user
            if ((x[1] == 'user') && (x[4] == 'user')) {
                // If this is a user-to-user session, you must be authenticated to join.
                if ((user._id != user1) && (user._id != user2)) { try { obj.close(); } catch (e) { } return null; }
            } else {
                // If only one side of the session is a user
                // !!!!! TODO: Need to make sure that one of the two sides is the correct user. !!!!!
            }
        }

        // Validate that the id is valid, we only need to do this on non-authenticated sessions.
        // TODO: Figure out when this needs to be done.
        /*
        if (!parent.args.notls) {
            // Check the identifier, if running without TLS, skip this.
            var ids = obj.id.split(':');
            if (ids.length != 3) { ws.close(); delete obj.id; return null; } // Invalid ID, drop this.
            if (parent.crypto.createHmac('SHA384', parent.relayRandom).update(ids[0] + ':' + ids[1]).digest('hex') != ids[2]) { ws.close(); delete obj.id; return null; } // Invalid HMAC, drop this.
            if ((Date.now() - parseInt(ids[1])) > 120000) { ws.close(); delete obj.id; return null; } // Expired time, drop this.
            obj.id = ids[0];
        }
        */

        // Check the peer connection status
        {
            var relayinfo = parent.wsrelays[obj.id];
            if (relayinfo) {
                if (relayinfo.state == 1) {
                    // Check that at least one connection is authenticated
                    if ((obj.authenticated != true) && (relayinfo.peer1.authenticated != true)) {
                        ws.close();
                        parent.parent.debug('relay', 'Relay without-auth: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ')');
                        delete obj.id;
                        delete obj.ws;
                        delete obj.peer;
                        return null;
                    }
                    
                    // Check that both connection are for the same user
                    if (!obj.id.startsWith('meshmessenger/')) {
                        var u1 = obj.user ? obj.user._id : obj.ruserid;
                        var u2 = relayinfo.peer1.user ? relayinfo.peer1.user._id : relayinfo.peer1.ruserid;
                        if (parent.args.user != null) { // If the server is setup with a default user, correct the userid now.
                            if (u1 != null) { u1 = 'user/' + domain.id + '/' + parent.args.user.toLowerCase(); }
                            if (u2 != null) { u2 = 'user/' + domain.id + '/' + parent.args.user.toLowerCase(); }
                        }
                        if (u1 != u2) {
                            ws.close();
                            parent.parent.debug('relay', 'Relay auth mismatch (' + u1 + ' != ' + u2 + '): ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ')');
                            delete obj.id;
                            delete obj.ws;
                            delete obj.peer;
                            return null;
                        }
                    }
                    
                    // Connect to peer
                    obj.peer = relayinfo.peer1;
                    obj.peer.peer = obj;
                    relayinfo.peer2 = obj;
                    relayinfo.state = 2;
                    relayinfo.peer1.ws._socket.resume(); // Release the traffic
                    relayinfo.peer2.ws._socket.resume(); // Release the traffic
                    ws.time = relayinfo.peer1.ws.time = Date.now();
                    
                    relayinfo.peer1.ws.peer = relayinfo.peer2.ws;
                    relayinfo.peer2.ws.peer = relayinfo.peer1.ws;
                    
                    // Remove the timeout
                    if (relayinfo.timeout) { clearTimeout(relayinfo.timeout); delete relayinfo.timeout; }
                    
                    // Setup the agent PING/PONG timers
                    if ((typeof parent.parent.args.agentping == 'number') && (obj.pingtimer == null)) { obj.pingtimer = setInterval(sendPing, parent.parent.args.agentping * 1000); }
                    else if ((typeof parent.parent.args.agentpong == 'number') && (obj.pongtimer == null)) { obj.pongtimer = setInterval(sendPong, parent.parent.args.agentpong * 1000); }
                    
                    // Setup the desktop decoder
                    obj.deskDecoder = obj.peer.deskDecoder = CreateDesktopDecoder();
                    obj.deskDecoder.addPeer(obj);
                    obj.deskDecoder.addPeer(obj.peer);

                    // Setup session recording
                    var sessionUser = obj.user;
                    if (sessionUser == null) { sessionUser = obj.peer.user; }
                    if ((sessionUser != null) && (domain.sessionrecording == true || ((typeof domain.sessionrecording == 'object') && ((domain.sessionrecording.protocols == null) || (domain.sessionrecording.protocols.indexOf(parseInt(obj.req.query.p)) >= 0))))) {
                        // Get the computer name
                        parent.db.Get(obj.req.query.nodeid, function (err, nodes) {
                            var xusername = '', xdevicename = '', xdevicename2 = null;
                            if ((nodes != null) && (nodes.length == 1)) { xdevicename2 = nodes[0].name; xdevicename = '-' + parent.common.makeFilename(nodes[0].name); }
                            
                            // Get the username and make it acceptable as a filename
                            if (sessionUser._id) { xusername = '-' + parent.common.makeFilename(sessionUser._id.split('/')[2]); }

                            var now = new Date(Date.now());
                            var recFilename = 'relaysession' + ((domain.id == '') ? '' : '-') + domain.id + '-' + now.getUTCFullYear() + '-' + parent.common.zeroPad(now.getUTCMonth(), 2) + '-' + parent.common.zeroPad(now.getUTCDate(), 2) + '-' + parent.common.zeroPad(now.getUTCHours(), 2) + '-' + parent.common.zeroPad(now.getUTCMinutes(), 2) + '-' + parent.common.zeroPad(now.getUTCSeconds(), 2) + xusername + xdevicename + '-' + obj.id + '.mcrec'
                            var recFullFilename = null;
                            if (domain.sessionrecording.filepath) {
                                try { parent.parent.fs.mkdirSync(domain.sessionrecording.filepath); } catch (e) { }
                                recFullFilename = parent.parent.path.join(domain.sessionrecording.filepath, recFilename);
                            } else {
                                try { parent.parent.fs.mkdirSync(parent.parent.recordpath); } catch (e) { }
                                recFullFilename = parent.parent.path.join(parent.parent.recordpath, recFilename);
                            }
                            parent.parent.fs.open(recFullFilename, 'w', function (err, fd) {
                                if (err != null) {
                                    // Unable to record
                                    try { ws.send('c'); } catch (ex) { } // Send connect to both peers
                                    try { relayinfo.peer1.ws.send('c'); } catch (ex) { }
                                } else {
                                    // Write the recording file header
                                    var metadata = { magic: 'MeshCentralRelaySession', ver: 1, userid: sessionUser._id, username: sessionUser.name, sessionid: obj.id, ipaddr1: cleanRemoteAddr(obj.req.ip), ipaddr2: cleanRemoteAddr(obj.peer.req.ip), time: new Date().toLocaleString(), protocol: (((obj.req == null) || (obj.req.query == null)) ? null : obj.req.query.p), nodeid: (((obj.req == null) || (obj.req.query == null)) ? null : obj.req.query.nodeid ) };
                                    if (xdevicename2 != null) { metadata.devicename = xdevicename2; }
                                    var firstBlock = JSON.stringify(metadata);
                                    recordingEntry(fd, 1, 0, firstBlock, function () {
                                        try { relayinfo.peer1.ws.logfile = ws.logfile = { fd: fd, lock: false, filename: recFullFilename }; } catch (ex) {
                                            try { ws.send('c'); } catch (ex) { } // Send connect to both peers, 'cr' indicates the session is being recorded.
                                            try { relayinfo.peer1.ws.send('c'); } catch (ex) { }
                                            return;
                                        }
                                        try { ws.send('cr'); } catch (ex) { } // Send connect to both peers, 'cr' indicates the session is being recorded.
                                        try { relayinfo.peer1.ws.send('cr'); } catch (ex) { }
                                    });
                                }
                            });
                        });
                    } else {
                        // Send session start
                        try { ws.send('c'); } catch (ex) { } // Send connect to both peers
                        try { relayinfo.peer1.ws.send('c'); } catch (ex) { }
                    }

                    parent.parent.debug('relay', 'Relay connected: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ' --> ' + cleanRemoteAddr(obj.peer.req.ip) + ')');

                    // Log the connection
                    if (sessionUser != null) {
                        var msg = 'Started relay session';
                        if (obj.req.query.p == 1) { msg = 'Started terminal session'; }
                        else if (obj.req.query.p == 2) { msg = 'Started desktop session'; }
                        else if (obj.req.query.p == 5) { msg = 'Started file management session'; }
                        var event = { etype: 'relay', action: 'relaylog', domain: domain.id, userid: sessionUser._id, username: sessionUser.name, msg: msg + ' \"' + obj.id + '\" from ' + cleanRemoteAddr(obj.peer.req.ip) + ' to ' + cleanRemoteAddr(req.ip), protocol: req.query.p, nodeid: req.query.nodeid };
                        parent.parent.DispatchEvent(['*', sessionUser._id], obj, event);
                    }
                } else {
                    // Connected already, drop (TODO: maybe we should re-connect?)
                    ws.close();
                    parent.parent.debug('relay', 'Relay duplicate: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ')');
                    delete obj.id;
                    delete obj.ws;
                    delete obj.peer;
                    return null;
                }
            } else {
                // Wait for other relay connection
                ws._socket.pause(); // Hold traffic until the other connection
                parent.wsrelays[obj.id] = { peer1: obj, state: 1, timeout: setTimeout(function () { closeBothSides(); }, 30000) };
                parent.parent.debug('relay', 'Relay holding: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ') ' + (obj.authenticated ? 'Authenticated' : ''));

                // Check if a peer server has this connection
                if (parent.parent.multiServer != null) {
                    var rsession = parent.wsPeerRelays[obj.id];
                    if ((rsession != null) && (rsession.serverId > parent.parent.serverId)) {
                        // We must initiate the connection to the peer
                        parent.parent.multiServer.createPeerRelay(ws, req, rsession.serverId, obj.req.session.userid);
                        delete parent.wsrelays[obj.id];
                    } else {
                        // Send message to other peers that we have this connection
                        parent.parent.multiServer.DispatchMessage(JSON.stringify({ action: 'relay', id: obj.id }));
                    }
                }
            }
        }
    }

    ws.flushSink = function () { try { ws._socket.resume(); } catch (ex) { console.log(ex); } };

    // When data is received from the mesh relay web socket
    ws.on('message', function (data) {
        // If this data was received by the agent, decode it.  
        if (this.me.deskDecoder != null) { this.me.deskDecoder.processData(this.me, data); }

        /*
        //console.log(typeof data, data.length);
        if (this.peer != null) {
            //if (typeof data == 'string') { console.log('Relay: ' + data); } else { console.log('Relay:' + data.length + ' byte(s)'); }
            try {
                this._socket.pause();
                if (this.logfile != null) {
                    // Write data to log file then perform relay
                    var xthis = this;
                    recordingEntry(this.logfile.fd, 2, ((obj.req.query.browser) ? 2 : 0), data, function () { xthis.peer.send(data, ws.flushSink); });
                } else {
                    // Perform relay
                    this.peer.send(data, ws.flushSink);
                }
            } catch (ex) { console.log(ex); }
        }
        */
    });

    // If error, close both sides of the relay.
    ws.on('error', function (err) {
        parent.relaySessionErrorCount++;
        if (obj.relaySessionCounted) { parent.relaySessionCount--; delete obj.relaySessionCounted; }
        console.log('Relay error from ' + cleanRemoteAddr(obj.req.ip) + ', ' + err.toString().split('\r')[0] + '.');
        closeBothSides();
    });

    // If the relay web socket is closed, close both sides.
    ws.on('close', function (req) {
        if (obj.relaySessionCounted) { parent.relaySessionCount--; delete obj.relaySessionCounted; }
        closeBothSides();
    });

    // Close both our side and the peer side.
    function closeBothSides() {
        if (obj.id != null) {
            var relayinfo = parent.wsrelays[obj.id];
            if (relayinfo != null) {
                if (relayinfo.state == 2) {
                    var peer = (relayinfo.peer1 == obj) ? relayinfo.peer2 : relayinfo.peer1;

                    // Disconnect the peer
                    try { if (peer.relaySessionCounted) { parent.relaySessionCount--; delete peer.relaySessionCounted; } } catch (ex) { console.log(ex); }
                    parent.parent.debug('relay', 'Relay disconnect: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ' --> ' + cleanRemoteAddr(peer.req.ip) + ')');
                    try { peer.ws.close(); } catch (e) { } // Soft disconnect
                    try { peer.ws._socket._parent.end(); } catch (e) { } // Hard disconnect

                    // Log the disconnection
                    if (ws.time) {
                        var msg = 'Ended relay session';
                        if (obj.req.query.p == 1) { msg = 'Ended terminal session'; }
                        else if (obj.req.query.p == 2) { msg = 'Ended desktop session'; }
                        else if (obj.req.query.p == 5) { msg = 'Ended file management session'; }
                        if (user) {
                            var event = { etype: 'relay', action: 'relaylog', domain: domain.id, userid: user._id, username: user.name, msg: msg + ' \"' + obj.id + '\" from ' + cleanRemoteAddr(obj.peer.req.ip) + ' to ' + cleanRemoteAddr(obj.req.ip) + ', ' + Math.floor((Date.now() - ws.time) / 1000) + ' second(s)', protocol: obj.req.query.p, nodeid: obj.req.query.nodeid };
                            parent.parent.DispatchEvent(['*', user._id], obj, event);
                        } else if (peer.user) {
                            var event = { etype: 'relay', action: 'relaylog', domain: domain.id, userid: peer.user._id, username: peer.user.name, msg: msg + ' \"' + obj.id + '\" from ' + cleanRemoteAddr(obj.peer.req.ip) + ' to ' + cleanRemoteAddr(obj.req.ip) + ', ' + Math.floor((Date.now() - ws.time) / 1000) + ' second(s)', protocol: obj.req.query.p, nodeid: obj.req.query.nodeid };
                            parent.parent.DispatchEvent(['*', peer.user._id], obj, event);
                        }
                    }

                    // Aggressive peer cleanup
                    delete peer.id;
                    delete peer.ws;
                    delete peer.peer;
                    if (peer.pingtimer != null) { clearInterval(peer.pingtimer); delete peer.pingtimer; }
                    if (peer.pongtimer != null) { clearInterval(peer.pongtimer); delete peer.pongtimer; }
                } else {
                    parent.parent.debug('relay', 'Relay disconnect: ' + obj.id + ' (' + cleanRemoteAddr(obj.req.ip) + ')');
                }

                // Close the recording file if needed
                if (ws.logfile != null) {
                    var logfile = ws.logfile;
                    delete ws.logfile;
                    if (peer.ws) { delete peer.ws.logfile; }
                    recordingEntry(logfile.fd, 3, 0, 'MeshCentralMCREC', function (fd, tag) {
                        parent.parent.fs.close(fd);
                        // Now that the recording file is closed, check if we need to index this file.
                        if (domain.sessionrecording.index !== false) { parent.parent.certificateOperations.acceleratorPerformOperation('indexMcRec', tag.logfile.filename); }
                    }, { ws: ws, pws: peer.ws, logfile: logfile });
                }

                try { ws.close(); } catch (ex) { }
                delete parent.wsrelays[obj.id];
            }
        }

        // Aggressive cleanup
        delete obj.id;
        delete obj.ws;
        delete obj.peer;
        if (obj.pingtimer != null) { clearInterval(obj.pingtimer); delete obj.pingtimer; }
        if (obj.pongtimer != null) { clearInterval(obj.pongtimer); delete obj.pongtimer; }
    }

    // Record a new entry in a recording log
    function recordingEntry(fd, type, flags, data, func, tag) {
        try {
            if (typeof data == 'string') {
                // String write
                var blockData = Buffer.from(data), header = Buffer.alloc(16); // Header: Type (2) + Flags (2) + Size(4) + Time(8)
                header.writeInt16BE(type, 0); // Type (1 = Header, 2 = Network Data)
                header.writeInt16BE(flags, 2); // Flags (1 = Binary, 2 = User)
                header.writeInt32BE(blockData.length, 4); // Size
                header.writeIntBE(new Date(), 10, 6); // Time
                var block = Buffer.concat([header, blockData]);
                parent.parent.fs.write(fd, block, 0, block.length, function () { func(fd, tag); });
            } else {
                // Binary write
                var header = Buffer.alloc(16); // Header: Type (2) + Flags (2) + Size(4) + Time(8)
                header.writeInt16BE(type, 0); // Type (1 = Header, 2 = Network Data)
                header.writeInt16BE(flags | 1, 2); // Flags (1 = Binary, 2 = User)
                header.writeInt32BE(data.length, 4); // Size
                header.writeIntBE(new Date(), 10, 6); // Time
                var block = Buffer.concat([header, data]);
                parent.parent.fs.write(fd, block, 0, block.length, function () { func(fd, tag); });
            }
        } catch (ex) { console.log(ex); func(fd, tag); }
    }

    // Mark this relay session as authenticated if this is the user end.
    obj.authenticated = (user != null);
    if (obj.authenticated) {
        // Kick off the routing, if we have agent routing instructions, process them here.
        // Routing instructions can only be given by a authenticated user
        if ((cookie != null) && (cookie.nodeid != null) && (cookie.tcpport != null) && (cookie.domainid != null)) {
            // We have routing instructions in the cookie, but first, check user access for this node.
            parent.db.Get(cookie.nodeid, function (err, docs) {
                if (docs.length == 0) { console.log('ERR: Node not found'); try { obj.close(); } catch (e) { } return; } // Disconnect websocket
                const node = docs[0];
                
                // Check if this user has permission to manage this computer
                if ((parent.GetNodeRights(user, node.meshid, node._id) & MESHRIGHT_REMOTECONTROL) == 0) { console.log('ERR: Access denied (1)'); try { obj.close(); } catch (e) { } return; }

                // Send connection request to agent
                const rcookie = parent.parent.encodeCookie({ ruserid: user._id }, parent.parent.loginCookieEncryptionKey);
                if (obj.id == undefined) { obj.id = ('' + Math.random()).substring(2); } // If there is no connection id, generate one.
                const command = { nodeid: cookie.nodeid, action: 'msg', type: 'tunnel', value: '*/meshrelay.ashx?id=' + obj.id + '&rauth=' + rcookie, tcpport: cookie.tcpport, tcpaddr: cookie.tcpaddr };
                parent.parent.debug('relay', 'Relay: Sending agent tunnel command: ' + JSON.stringify(command));
                if (obj.sendAgentMessage(command, user._id, cookie.domainid) == false) { delete obj.id; parent.parent.debug('relay', 'Relay: Unable to contact this agent (' + cleanRemoteAddr(obj.req.ip) + ')'); }
                performRelay();
            });
            return obj;
        } else if ((obj.req.query.nodeid != null) && ((obj.req.query.tcpport != null) || (obj.req.query.udpport != null))) {
            // We have routing instructions in the URL arguments, but first, check user access for this node.
            parent.db.Get(obj.req.query.nodeid, function (err, docs) {
                if (docs.length == 0) { console.log('ERR: Node not found'); try { obj.close(); } catch (e) { } return; } // Disconnect websocket
                const node = docs[0];
                
                // Check if this user has permission to manage this computer
                if ((parent.GetNodeRights(user, node.meshid, node._id) & MESHRIGHT_REMOTECONTROL) == 0) { console.log('ERR: Access denied (2)'); try { obj.close(); } catch (e) { } return; }

                // Send connection request to agent
                if (obj.id == null) { obj.id = ('' + Math.random()).substring(2); } // If there is no connection id, generate one.
                const rcookie = parent.parent.encodeCookie({ ruserid: user._id }, parent.parent.loginCookieEncryptionKey);

                if (obj.req.query.tcpport != null) {
                    const command = { nodeid: obj.req.query.nodeid, action: 'msg', type: 'tunnel', value: '*/meshrelay.ashx?id=' + obj.id + '&rauth=' + rcookie, tcpport: obj.req.query.tcpport, tcpaddr: ((obj.req.query.tcpaddr == null) ? '127.0.0.1' : obj.req.query.tcpaddr) };
                    parent.parent.debug('relay', 'Relay: Sending agent TCP tunnel command: ' + JSON.stringify(command));
                    if (obj.sendAgentMessage(command, user._id, domain.id) == false) { delete obj.id; parent.parent.debug('relay', 'Relay: Unable to contact this agent (' + cleanRemoteAddr(obj.req.ip) + ')'); }
                } else if (obj.req.query.udpport != null) {
                    const command = { nodeid: obj.req.query.nodeid, action: 'msg', type: 'tunnel', value: '*/meshrelay.ashx?id=' + obj.id + '&rauth=' + rcookie, udpport: obj.req.query.udpport, udpaddr: ((obj.req.query.udpaddr == null) ? '127.0.0.1' : obj.req.query.udpaddr) };
                    parent.parent.debug('relay', 'Relay: Sending agent UDP tunnel command: ' + JSON.stringify(command));
                    if (obj.sendAgentMessage(command, user._id, domain.id) == false) { delete obj.id; parent.parent.debug('relay', 'Relay: Unable to contact this agent (' + cleanRemoteAddr(obj.req.ip) + ')'); }
                }
                performRelay();
            });
            return obj;
        }
    }

    // If this is not an authenticated session, or the session does not have routing instructions, just go ahead an connect to existing session.
    performRelay();
    return obj;
};

/*
Relay session recording required that "SessionRecording":true be set in the domain section of the config.json.
Once done, a folder "meshcentral-recordings" will be created next to "meshcentral-data" that will contain all
of the recording files with the .mcrec extension.

The recording files are binary and contain a set of:

    <HEADER><DATABLOCK><HEADER><DATABLOCK><HEADER><DATABLOCK><HEADER><DATABLOCK>...

The header is always 16 bytes long and is encoded like this:

    TYPE   2 bytes, 1 = Header, 2 = Network Data, 3 = EndBlock
    FLAGS  2 bytes, 0x0001 = Binary, 0x0002 = User
    SIZE   4 bytes, Size of the data following this header.
    TIME   8 bytes, Time this record was written, number of milliseconds since 1 January, 1970 UTC.

All values are BigEndian encoded. The first data block is of TYPE 1 and contains a JSON string with information
about this recording. It looks something like this:

{
    magic: 'MeshCentralRelaySession',
    ver: 1,
    userid: "user\domain\userid",
    username: "username",
    sessionid: "RandomValue",
    ipaddr1: 1.2.3.4,
    ipaddr2: 1.2.3.5,
    time: new Date().toLocaleString()
}

The rest of the data blocks are all network traffic that was relayed thru the server. They are of TYPE 2 and have
a given size and timestamp. When looking at network traffic the flags are important:

- If traffic has the first (0x0001) flag set, the data is binary otherwise it's a string.
- If the traffic has the second (0x0002) flag set, traffic is coming from the user's browser, if not, it's coming from the MeshAgent.
*/