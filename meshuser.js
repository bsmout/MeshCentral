﻿/**
* @description MeshCentral MeshAgent
* @author Ylian Saint-Hilaire & Bryan Roe
* @copyright Intel Corporation 2018-2019
* @license Apache-2.0
* @version v0.0.1
*/

/*jslint node: true */
/*jshint node: true */
/*jshint strict:false */
/*jshint -W097 */
/*jshint esversion: 6 */
"use strict";

// Construct a MeshAgent object, called upon connection
module.exports.CreateMeshUser = function (parent, db, ws, req, args, domain, user) {
    const fs = require('fs');
    const path = require('path');
    const common = parent.common;

    var obj = {};
    obj.user = user;
    obj.domain = domain;

    // Send a message to the user
    //obj.send = function (data) { try { if (typeof data == 'string') { ws.send(Buffer.from(data, 'binary')); } else { ws.send(data); } } catch (e) { } }

    // Disconnect this user
    obj.close = function (arg) {
        if ((arg == 1) || (arg == null)) { try { ws.close(); parent.parent.debug(1, 'Soft disconnect'); } catch (e) { console.log(e); } } // Soft close, close the websocket
        if (arg == 2) { try { ws._socket._parent.end(); parent.parent.debug(1, 'Hard disconnect'); } catch (e) { console.log(e); } } // Hard close, close the TCP socket

        // Perform cleanup
        parent.parent.RemoveAllEventDispatch(ws);
        if (obj.serverStatsTimer != null) { clearInterval(obj.serverStatsTimer); delete obj.serverStatsTimer; }
        if (req.session && req.session.ws && req.session.ws == ws) { delete req.session.ws; }
        if (parent.wssessions2[ws.sessionId]) { delete parent.wssessions2[ws.sessionId]; }
        if (parent.wssessions[obj.user._id]) {
            var i = parent.wssessions[obj.user._id].indexOf(ws);
            if (i >= 0) {
                parent.wssessions[obj.user._id].splice(i, 1);
                var user = parent.users[obj.user._id];
                if (user) {
                    if (parent.parent.multiServer == null) {
                        parent.parent.DispatchEvent(['*'], obj, { action: 'wssessioncount', username: obj.user.name, count: parent.wssessions[obj.user._id].length, nolog: 1, domain: domain.id });
                    } else {
                        parent.recountSessions(ws.sessionId); // Recount sessions
                    }
                }
                if (parent.wssessions[obj.user._id].length == 0) { delete parent.wssessions[obj.user._id]; }
            }
        }

        // If we have peer servers, inform them of the disconnected session
        if (parent.parent.multiServer != null) { parent.parent.multiServer.DispatchMessage({ action: 'sessionEnd', sessionid: ws.sessionId }); }

        // Aggressive cleanup
        if (obj.user) { delete obj.user; }
        if (obj.domain) { delete obj.domain; }
        if (ws.userid) { delete ws.userid; }
        if (ws.domainid) { delete ws.domainid; }
        if (ws.sessionId) { delete ws.sessionId; }
        if (ws.HandleEvent) { delete ws.HandleEvent; }
        ws.removeAllListeners(["message", "close", "error"]);
    };

    // Convert a mesh path array into a real path on the server side
    function meshPathToRealPath(meshpath, user) {
        if (common.validateArray(meshpath, 1) == false) return null;
        var splitid = meshpath[0].split('/');
        if (splitid[0] == 'user') {
            // Check user access
            if (meshpath[0] != user._id) return null; // Only allow own user folder
        } else if (splitid[0] == 'mesh') {
            // Check mesh access
            var meshrights = user.links[meshpath[0]];
            if (meshrights == null) return null; // No meth rights for this user
            meshrights = meshrights.rights; // Get the rights bit mask
            if ((meshrights == null) || ((meshrights & 32) == 0)) return null; // This user must have mesh rights to "server files"
        } else return null;
        var rootfolder = meshpath[0], rootfoldersplit = rootfolder.split('/'), domainx = 'domain';
        if (rootfoldersplit[1].length > 0) domainx = 'domain-' + rootfoldersplit[1];
        var path = parent.path.join(parent.filespath, domainx, rootfoldersplit[0] + "-" + rootfoldersplit[2]);
        for (var i = 1; i < meshpath.length; i++) { if (common.IsFilenameValid(meshpath[i]) == false) { path = null; break; } path += ("/" + meshpath[i]); }
        return path;
    }

    // TODO: Replace this with something better?
    function copyFile(src, dest, func, tag) {
        var ss = fs.createReadStream(src), ds = fs.createWriteStream(dest);
        ss.pipe(ds);
        ds.ss = ss;
        if (arguments.length == 3 && typeof arguments[2] === 'function') { ds.on('close', arguments[2]); }
        else if (arguments.length == 4 && typeof arguments[3] === 'function') { ds.on('close', arguments[3]); }
        ds.on('close', function () { func(tag); });
    }

    // Route a command to a target node
    function routeCommandToNode(command) {
        if (common.validateString(command.nodeid, 8, 128) == false) return false;
        var splitnodeid = command.nodeid.split('/');
        // Check that we are in the same domain and the user has rights over this node.
        if ((splitnodeid[0] == 'node') && (splitnodeid[1] == domain.id)) {
            // See if the node is connected
            var agent = parent.wsagents[command.nodeid];
            if (agent != null) {
                // Check if we have permission to send a message to that node
                var rights = user.links[agent.dbMeshKey];
                if ((rights != null) && ((rights.rights & 8) || (rights.rights & 256))) { // 8 is remote control permission, 256 is desktop read only
                    command.sessionid = ws.sessionId;   // Set the session id, required for responses.
                    command.rights = rights.rights;     // Add user rights flags to the message
                    delete command.nodeid;              // Remove the nodeid since it's implyed.
                    try { agent.send(JSON.stringify(command)); } catch (ex) { }
                }
            } else {
                // Check if a peer server is connected to this agent
                var routing = parent.parent.GetRoutingServerId(command.nodeid, 1); // 1 = MeshAgent routing type
                if (routing != null) {
                    // Check if we have permission to send a message to that node
                    var rights = user.links[routing.meshid];
                    if ((rights != null) && ((rights.rights & 8) || (rights.rights & 256))) { // 8 is remote control permission
                        command.fromSessionid = ws.sessionId;   // Set the session id, required for responses.
                        command.rights = rights.rights;         // Add user rights flags to the message
                        parent.parent.multiServer.DispatchMessageSingleServer(command, routing.serverid);
                    }
                }
            }
        }
        return true;
    }

    // Route a command to all targets in a mesh
    function routeCommandToMesh(meshid, command) {
        // Send the request to all peer servers
        // TODO !!!!

        // See if the node is connected
        for (var nodeid in parent.wsagents) {
            var agent = parent.wsagents[nodeid];
            if (agent.dbMeshKey == meshid) { try { agent.send(JSON.stringify(command)); } catch (ex) { } }
        }
        return true;
    }

    try {
        // Check if the user is logged in
        if (user == null) { try { ws.close(); } catch (e) { } return; }

        // Check if we have exceeded the user session limit
        if ((typeof domain.limits.maxusersessions == 'number') || (typeof domain.limits.maxsingleusersessions == 'number')) {
            // Count the number of user sessions for this domain
            var domainUserSessionCount = 0, selfUserSessionCount = 0;
            for (var i in parent.wssessions2) {
                if (parent.wssessions2[i].domainid == domain.id) {
                    domainUserSessionCount++; if (parent.wssessions2[i].userid == user._id) { selfUserSessionCount++; }
                }
            }

            // Check if we have too many user sessions
            if (((typeof domain.limits.maxusersessions == 'number') && (domainUserSessionCount >= domain.limits.maxusersessions)) || ((typeof domain.limits.maxsingleusersessions == 'number') && (selfUserSessionCount >= domain.limits.maxsingleusersessions))) {
                ws.send(JSON.stringify({ action: 'stopped', msg: 'Session count exceed' }));
                try { ws.close(); } catch (e) { }
                return;
            }
        }

        // Associate this websocket session with the web session
        ws.userid = user._id;
        ws.domainid = domain.id;

        // Create a new session id for this user.
        parent.crypto.randomBytes(20, function (err, randombuf) {
            ws.sessionId = user._id + '/' + randombuf.toString('hex');

            // Add this web socket session to session list
            parent.wssessions2[ws.sessionId] = ws;
            if (!parent.wssessions[user._id]) { parent.wssessions[user._id] = [ws]; } else { parent.wssessions[user._id].push(ws); }
            if (parent.parent.multiServer == null) {
                parent.parent.DispatchEvent(['*'], obj, { action: 'wssessioncount', username: user.name, count: parent.wssessions[user._id].length, nolog: 1, domain: domain.id });
            } else {
                parent.recountSessions(ws.sessionId); // Recount sessions
            }

            // If we have peer servers, inform them of the new session
            if (parent.parent.multiServer != null) { parent.parent.multiServer.DispatchMessage({ action: 'sessionStart', sessionid: ws.sessionId }); }

            // Handle events
            ws.HandleEvent = function (source, event) {
                if (!event.domain || event.domain == domain.id) {
                    try {
                        if (event == 'close') { try { delete req.session; } catch (ex) { } obj.close(); }
                        else if (event == 'resubscribe') { user.subscriptions = parent.subscribe(user._id, ws); }
                        else if (event == 'updatefiles') { updateUserFiles(user, ws, domain); }
                        else { ws.send(JSON.stringify({ action: 'event', event: event })); }
                    } catch (e) { }
                }
            };

            user.subscriptions = parent.subscribe(user._id, ws); // Subscribe to events
            try { ws._socket.setKeepAlive(true, 240000); } catch (ex) { } // Set TCP keep alive

            // Send current server statistics
            obj.SendServerStats = function () {
                var os = require('os');
                var stats = { action: 'serverstats', totalmem: os.totalmem(), freemem: os.freemem() };
                if (parent.parent.platform != 'win32') { stats.cpuavg = os.loadavg(); } // else { stats.cpuavg = [ 0.2435345, 0.523234234, 0.6435345345 ]; }
                var serverStats = {
                    "User Accounts": Object.keys(parent.users).length,
                    "Device Groups": Object.keys(parent.meshes).length,
                    "Agent Sessions": Object.keys(parent.wsagents).length,
                    "Connected Users": Object.keys(parent.wssessions).length,
                    "Users Sessions": Object.keys(parent.wssessions2).length,
                    "Relay Sessions": parent.relaySessionCount,
                };
                if (parent.relaySessionErrorCount != 0) { serverStats['Relay Errors'] = parent.relaySessionErrorCount; }
                if (parent.parent.mpsserver != null) { serverStats['Connected Intel&reg; AMT'] = Object.keys(parent.parent.mpsserver.ciraConnections).length; }
                stats.values = { "Server State": serverStats }
                try { ws.send(JSON.stringify(stats)); } catch (ex) { }
            }

            // When data is received from the web socket
            ws.on('message', processWebSocketData);

            // If error, do nothing
            ws.on('error', function (err) { console.log(err); obj.close(0); });

            // If the web socket is closed
            ws.on('close', function (req) { obj.close(0); });

            // Figure out the MPS port, use the alias if set
            var mpsport = ((args.mpsaliasport != null) ? args.mpsaliasport : args.mpsport);
            var httpport = ((args.aliasport != null) ? args.aliasport : args.port);

            // Build server information object
            var serverinfo = { name: parent.certificates.CommonName, mpsname: parent.certificates.AmtMpsName, mpsport: mpsport, mpspass: args.mpspass, port: httpport, emailcheck: ((parent.parent.mailserver != null) && (domain.auth != 'sspi')), domainauth: (domain.auth == 'sspi') };
            if (args.notls == true) { serverinfo.https = false; } else { serverinfo.https = true; serverinfo.redirport = args.redirport; }

            // Send server information
            try { ws.send(JSON.stringify({ action: 'serverinfo', serverinfo: serverinfo })); } catch (ex) { }

            // Send user information to web socket, this is the first thing we send
            try { ws.send(JSON.stringify({ action: 'userinfo', userinfo: parent.CloneSafeUser(parent.users[user._id]) })); } catch (ex) { }

            // We are all set, start receiving data
            ws._socket.resume();
        });
    } catch (e) { console.log(e); }

    // Process incoming web socket data from the browser
    function processWebSocketData(msg) {
        var command, i = 0, mesh = null, meshid = null, nodeid = null, meshlinks = null, change = 0;
        try { command = JSON.parse(msg.toString('utf8')); } catch (e) { return; }
        if (common.validateString(command.action, 3, 32) == false) return; // Action must be a string between 3 and 32 chars

        switch (command.action) {
            case 'ping': { try { ws.send(JSON.stringify({ action: 'pong' })); } catch (ex) { } break; }
            case 'authcookie':
                {
                    // Renew the authentication cookie
                    try { ws.send(JSON.stringify({ action: 'authcookie', cookie: parent.parent.encodeCookie({ userid: user._id, domainid: domain.id }, parent.parent.loginCookieEncryptionKey) })); } catch (ex) { }
                    break;
                }
            case 'servertimelinestats':
                {
                    if ((user.siteadmin & 21) == 0) return; // Only site administrators with "site backup" or "site restore" or "site update" permissions can use this.
                    if (common.validateInt(command.hours, 0, 24 * 30) == false) return;
                    db.GetServerStats(command.hours, function (err, docs) {
                        if (err == null) { ws.send(JSON.stringify({ action: 'servertimelinestats', events: docs })); }
                    });
                    break;
                }
            case 'serverstats':
                {
                    if ((user.siteadmin & 21) == 0) return; // Only site administrators with "site backup" or "site restore" or "site update" permissions can use this.
                    if (common.validateInt(command.interval, 1000, 1000000) == false) {
                        // Clear the timer
                        if (obj.serverStatsTimer != null) { clearInterval(obj.serverStatsTimer); delete obj.serverStatsTimer; }
                    } else {
                        // Set the timer
                        obj.SendServerStats();
                        obj.serverStatsTimer = setInterval(obj.SendServerStats, command.interval);
                    }
                    break;
                }
            case 'meshes':
                {
                    // Request a list of all meshes this user as rights to
                    var docs = [];
                    for (i in user.links) { if ((parent.meshes[i]) && (parent.meshes[i].deleted == null)) { docs.push(parent.meshes[i]); } }
                    try { ws.send(JSON.stringify({ action: 'meshes', meshes: docs, tag: command.tag })); } catch (ex) { }
                    break;
                }
            case 'nodes':
                {
                    var links = [];
                    if (command.meshid == null) {
                        // Request a list of all meshes this user as rights to
                        for (i in user.links) { links.push(i); }
                    } else {
                        // Request list of all nodes for one specific meshid
                        meshid = command.meshid;
                        if (common.validateString(meshid, 0, 128) == false) return;
                        if (meshid.split('/').length == 0) { meshid = 'mesh/' + domain.id + '/' + command.meshid; }
                        if (user.links[meshid] != null) { links.push(meshid); }
                    }

                    // Request a list of all nodes
                    db.GetAllTypeNoTypeFieldMeshFiltered(links, domain.id, 'node', command.id, function (err, docs) {
                        var r = {};
                        for (i in docs) {
                            // Add the connection state
                            var state = parent.parent.GetConnectivityState(docs[i]._id);
                            if (state) {
                                docs[i].conn = state.connectivity;
                                docs[i].pwr = state.powerState;
                                if ((state.connectivity & 1) != 0) { var agent = parent.wsagents[docs[i]._id]; if (agent != null) { docs[i].agct = agent.connectTime; } }
                                if ((state.connectivity & 2) != 0) { var cira = parent.parent.mpsserver.ciraConnections[docs[i]._id]; if (cira != null) { docs[i].cict = cira.tag.connectTime; } }
                            }

                            // Compress the meshid's
                            meshid = docs[i].meshid;
                            if (!r[meshid]) { r[meshid] = []; }
                            delete docs[i].meshid;

                            // Remove Intel AMT credential if present
                            if (docs[i].intelamt != null && docs[i].intelamt.pass != null) { delete docs[i].intelamt.pass; }

                            // If GeoLocation not enabled, remove any node location information
                            if (domain.geolocation != true) {
                                if (docs[i].iploc != null) { delete docs[i].iploc; }
                                if (docs[i].wifiloc != null) { delete docs[i].wifiloc; }
                                if (docs[i].gpsloc != null) { delete docs[i].gpsloc; }
                                if (docs[i].userloc != null) { delete docs[i].userloc; }
                            }

                            r[meshid].push(docs[i]);
                        }
                        try { ws.send(JSON.stringify({ action: 'nodes', nodes: r, tag: command.tag })); } catch (ex) { }
                    });
                    break;
                }
            case 'powertimeline':
                {
                    // Query the database for the power timeline for a given node
                    // The result is a compacted array: [ startPowerState, startTimeUTC, powerState ] + many[ deltaTime, powerState ]
                    if (common.validateString(command.nodeid, 0, 128) == false) return;
                    db.getPowerTimeline(command.nodeid, function (err, docs) {
                        if (err == null && docs.length > 0) {
                            var timeline = [], time = null, previousPower;
                            for (i in docs) {
                                var doc = docs[i];

                                // Skip all starting power 0 events.
                                if ((time == null) && (doc.power == 0) && ((doc.oldPower == null) || (doc.oldPower == 0))) { continue; }

                                doc.time = Date.parse(doc.time);
                                if (time == null) {
                                    // First element
                                    time = doc.time;
                                    if (doc.oldPower) { timeline.push(doc.oldPower); } else { timeline.push(0); }
                                    timeline.push(time / 1000);
                                    timeline.push(doc.power);
                                    previousPower = doc.power;
                                } else {
                                    // Delta element
                                    if ((previousPower != doc.power) && ((doc.time - time) > 60000)) { // To boost speed, small blocks get approximated.
                                        // Create a new timeline
                                        timeline.push((doc.time - time) / 1000);
                                        timeline.push(doc.power);
                                        time = doc.time;
                                        previousPower = doc.power;
                                    } else {
                                        // Merge with previous timeline
                                        timeline[timeline.length - 2] += ((doc.time - time) / 1000);
                                        timeline[timeline.length - 1] = doc.power;
                                        previousPower = doc.power;
                                    }
                                }
                            }
                            try { ws.send(JSON.stringify({ action: 'powertimeline', nodeid: command.nodeid, timeline: timeline, tag: command.tag })); } catch (ex) { }
                        } else {
                            // No records found, send current state if we have it
                            var state = parent.parent.GetConnectivityState(command.nodeid);
                            if (state != null) { try { ws.send(JSON.stringify({ action: 'powertimeline', nodeid: command.nodeid, timeline: [state.powerState, Date.now(), state.powerState], tag: command.tag })); } catch (ex) { } }
                        }
                    });
                    break;
                }
            case 'lastconnect':
                {
                    if (common.validateString(command.nodeid, 0, 128) == false) return;

                    // Query the database for the last time this node connected
                    db.Get('lc' + command.nodeid, function (err, docs) {
                        if ((docs != null) && (docs.length > 0)) { try { ws.send(JSON.stringify({ action: 'lastconnect', nodeid: command.nodeid, time: docs[0].time, addr: docs[0].addr })); } catch (ex) { } }
                    });
                    break;
                }
            case 'files':
                {
                    // Send the full list of server files to the browser app
                    updateUserFiles(user, ws, domain);
                    break;
                }
            case 'fileoperation':
                {
                    // Check permissions
                    if ((user.siteadmin & 8) != 0) {
                        // Perform a file operation (Create Folder, Delete Folder, Delete File...)
                        if (common.validateString(command.fileop, 4, 16) == false) return;
                        var sendUpdate = true, path = meshPathToRealPath(command.path, user); // This will also check access rights
                        if (path == null) break;

                        if ((command.fileop == 'createfolder') && (common.IsFilenameValid(command.newfolder) == true)) {
                            // Create a new folder
                            try { fs.mkdirSync(path + "/" + command.newfolder); } catch (e) {
                                try { fs.mkdirSync(path); } catch (e) { }
                                try { fs.mkdirSync(path + "/" + command.newfolder); } catch (e) { }
                            }
                        } 
                        else if (command.fileop == 'delete') {
                            // Delete a file
                            if (common.validateArray(command.delfiles, 1) == false) return;
                            for (i in command.delfiles) {
                                if (common.IsFilenameValid(command.delfiles[i]) == true) {
                                    var fullpath = parent.path.join(path, command.delfiles[i]);
                                    if (command.rec == true) {
                                        deleteFolderRecursive(fullpath); // TODO, make this an async function
                                    } else {
                                        try { fs.rmdirSync(fullpath); } catch (e) { try { fs.unlinkSync(fullpath); } catch (e) { } }
                                    }
                                }
                            }

                            // If we deleted something in the mesh root folder and the entire mesh folder is empty, remove it.
                            if (command.path.length == 1) {
                                try {
                                    if (command.path[0].startsWith('mesh//')) {
                                        path = meshPathToRealPath([command.path[0]], user);
                                        fs.readdir(path, function (err, dir) { if ((err == null) && (dir.length == 0)) { fs.rmdir(path, function (err) { }); } });
                                    }
                                } catch (ex) { }
                            }
                        }
                        else if ((command.fileop == 'rename') && (common.IsFilenameValid(command.oldname) == true) && (common.IsFilenameValid(command.newname) == true)) {
                            // Rename
                            try { fs.renameSync(path + "/" + command.oldname, path + "/" + command.newname); } catch (e) { }
                        }
                        else if ((command.fileop == 'copy') || (command.fileop == 'move')) {
                            if (common.validateArray(command.names, 1) == false) return;
                            var scpath = meshPathToRealPath(command.scpath, user); // This will also check access rights
                            if (scpath == null) break;
                            // TODO: Check quota if this is a copy!!!!!!!!!!!!!!!!
                            for (i in command.names) {
                                var s = parent.path.join(scpath, command.names[i]), d = parent.path.join(path, command.names[i]);
                                sendUpdate = false;
                                copyFile(s, d, function (op) { if (op != null) { fs.unlink(op, function (err) { parent.parent.DispatchEvent([user._id], obj, 'updatefiles'); }); } else { parent.parent.DispatchEvent([user._id], obj, 'updatefiles'); } }, ((command.fileop == 'move') ? s : null));
                            }
                        }

                        if (sendUpdate == true) { parent.parent.DispatchEvent([user._id], obj, 'updatefiles'); } // Fire an event causing this user to update this files
                    }
                    break;
                }
            case 'serverconsole':
                {
                    // This is a server console message, only process this if full administrator
                    if (user.siteadmin != 0xFFFFFFFF) break;

                    var r = '';
                    var cmdargs = splitArgs(command.value);
                    if (cmdargs.length == 0) break;
                    const cmd = cmdargs[0].toLowerCase();
                    cmdargs = parseArgs(cmdargs);

                    switch (cmd) {
                        case 'help': {
                            r =  'Available commands: help, info, versions, args, resetserver, showconfig, usersessions, tasklimiter, setmaxtasks, cores,\r\n'
                            r += 'migrationagents, swarmstats, nodeconfig, heapdump.';
                            break;
                        }
                        case 'info': {
                            var info = process.memoryUsage();
                            try { info.platform = process.platform; } catch (ex) { }
                            try { info.arch = process.arch; } catch (ex) { }
                            try { info.pid = process.pid; } catch (ex) { }
                            try { info.uptime = process.uptime(); } catch (ex) { }
                            try { info.version = process.version; } catch (ex) { }
                            try { info.cpuUsage = process.cpuUsage(); } catch (ex) { }
                            r = JSON.stringify(info, null, 4);
                            break;
                        }
                        case 'nodeconfig': {
                            r = JSON.stringify(process.config, null, 4);
                            break;
                        }
                        case 'versions': {
                            r = JSON.stringify(process.versions, null, 4);
                            break;
                        }
                        case 'args': {
                            r = cmd + ': ' + JSON.stringify(cmdargs);
                            break;
                        }
                        case 'usersessions': {
                            for (var i in parent.wssessions) {
                                r += (i + ', ' + parent.wssessions[i].length + ' session' + ((parent.wssessions[i].length > 1) ? 'a' : '') + '.<br />');
                                for (var j in parent.wssessions[i]) {
                                    var addr = parent.wssessions[i][j]._socket.remoteAddress;
                                    if (addr.startsWith('::ffff:')) { addr = addr.substring(7); }
                                    r += '    ' + addr + ' --> ' + parent.wssessions[i][j].sessionId + '.<br />';
                                }
                            }
                            break;
                        }
                        case 'resetserver': {
                            console.log('Server restart...');
                            process.exit(0);
                            break;
                        }
                        case 'tasklimiter': {
                            if (parent.parent.taskLimiter != null) {
                                //var obj = { maxTasks: maxTasks, maxTaskTime: (maxTaskTime * 1000), nextTaskId: 0, currentCount: 0, current: {}, pending: [[], [], []], timer: null };
                                const tl = parent.parent.taskLimiter;
                                r += 'MaxTasks: ' + tl.maxTasks + ', NextTaskId: ' + tl.nextTaskId + '<br />';
                                r += 'MaxTaskTime: ' + (tl.maxTaskTime / 1000) + ' seconds, Timer: ' + (tl.timer != null) + '<br />';
                                var c = [];
                                for (var i in tl.current) { c.push(i); }
                                r += 'Current (' + tl.currentCount + '): [' + c.join(', ') + ']<br />';
                                r += 'Pending (High/Med/Low): ' + tl.pending[0].length + ', ' + tl.pending[1].length + ', ' + tl.pending[2].length + '<br />';
                            }
                            break;
                        }
                        case 'setmaxtasks': {
                            if ((cmdargs["_"].length != 1) || (parseInt(cmdargs["_"][0]) < 1) || (parseInt(cmdargs["_"][0]) > 1000)) {
                                r = 'Usage: setmaxtasks [1 to 1000]';
                            } else {
                                parent.parent.taskLimiter.maxTasks = parseInt(cmdargs["_"][0]);
                                r = 'MaxTasks set to ' + parent.parent.taskLimiter.maxTasks + '.';
                            }
                            break;
                        }
                        case 'cores': {
                            if (parent.parent.defaultMeshCores != null) { for (var i in parent.parent.defaultMeshCores) { r += i + ': ' + parent.parent.defaultMeshCores[i].length + ' bytes<br />'; } }
                            break;
                        }
                        case 'showconfig': {
                            // Make a copy of the configuration and hide any secrets
                            var config = common.Clone(parent.parent.config);
                            if (config.settings) {
                                if (config.settings.configkey) { config.settings.configkey = '(present)'; }
                                if (config.settings.sessionkey) { config.settings.sessionkey = '(present)'; }
                                if (config.settings.dbencryptkey) { config.settings.dbencryptkey = '(present)'; }
                            }
                            if (config.domains) {
                                for (var i in config.domains) {
                                    if (config.domains[i].yubikey && config.domains[i].yubikey.secret) { config.domains[i].yubikey.secret = '(present)'; }
                                }
                            }
                            
                            r = JSON.stringify(removeAllUnderScore(config), null, 4);
                            break;
                        }
                        case 'migrationagents': {
                            if (parent.parent.swarmserver == null) {
                                r = 'Swarm server not running.';
                            } else {
                                for (var i in parent.parent.swarmserver.migrationAgents) {
                                    var arch = parent.parent.swarmserver.migrationAgents[i];
                                    for (var j in arch) { var agent = arch[j]; r += 'Arch ' + agent.arch + ', Ver ' + agent.ver + ', Size ' + ((agent.binary == null) ? 0 : agent.binary.length) + '<br />'; }
                                }
                            }
                            break;
                        }
                        case 'swarmstats': {
                            if (parent.parent.swarmserver == null) {
                                r = 'Swarm server not running.';
                            } else {
                                for (var i in parent.parent.swarmserver.stats) {
                                    if (typeof parent.parent.swarmserver.stats[i] == 'object') {
                                        r += i + ' ' + JSON.stringify(parent.parent.swarmserver.stats[i]) + '<br />';
                                    } else {
                                        r += i + ' ' + parent.parent.swarmserver.stats[i] + '<br />';
                                    }
                                }
                            }
                            break;
                        }
                        case 'heapdump': {
                            var heapdump = null;
                            try { heapdump = require('heapdump'); } catch (ex) { }
                            if (heapdump == null) {
                                r = 'Heapdump module not installed, run "npm install heapdump".';
                            } else {
                                heapdump.writeSnapshot(function (err, filename) {
                                    if (err != null) {
                                        try { ws.send(JSON.stringify({ action: 'serverconsole', value: 'Unable to write heapdump: ' + err })); } catch (ex) { }
                                    } else {
                                        try { ws.send(JSON.stringify({ action: 'serverconsole', value: 'Wrote heapdump at ' + filename })); } catch (ex) { }
                                    }
                                });
                            }
                            break;
                        }
                        default: { // This is an unknown command, return an error message
                            r = 'Unknown command \"' + cmd + '\", type \"help\" for list of avaialble commands.';
                            break;
                        }
                    }

                    if (r != '') { try { ws.send(JSON.stringify({ action: 'serverconsole', value: r, tag: command.tag })); } catch (ex) { } }
                    break;
                }
            case 'msg':
                {
                    // Route this command to a target node
                    routeCommandToNode(command);
                    break;
                }
            case 'events':
                {
                    // User filtered events
                    if ((command.user != null) && ((user.siteadmin & 2) != 0)) { // SITERIGHT_MANAGEUSERS
                        // TODO: Add the meshes command.user has access to (???)
                        var filter = ['user/' + domain.id + '/' + command.user.toLowerCase()];
                        if ((command.limit == null) || (typeof command.limit != 'number')) {
                            // Send the list of all events for this session
                            db.GetUserEvents(filter, domain.id, command.user, function (err, docs) {
                                if (err != null) return;
                                try { ws.send(JSON.stringify({ action: 'events', events: docs, user: command.user, tag: command.tag })); } catch (ex) { }
                            });
                        } else {
                            // Send the list of most recent events for this session, up to 'limit' count
                            db.GetUserEventsWithLimit(filter, domain.id, command.user, command.limit, function (err, docs) {
                                if (err != null) return;
                                try { ws.send(JSON.stringify({ action: 'events', events: docs, user: command.user, tag: command.tag })); } catch (ex) { }
                            });
                        }
                    } else if (common.validateString(command.nodeid, 0, 128) == true) { // Device filtered events
                        // TODO: Check that the user has access to this nodeid
                        var limit = 10000;
                        if (common.validateInt(command.limit, 1, 60000) == true) { limit = command.limit; }

                        // Send the list of most recent events for this session, up to 'limit' count
                        db.GetNodeEventsWithLimit(command.nodeid, domain.id, limit, function (err, docs) {
                            if (err != null) return;
                            try { ws.send(JSON.stringify({ action: 'events', events: docs, nodeid: command.nodeid, tag: command.tag })); } catch (ex) { }
                        });
                    } else {
                        // All events
                        var filter = user.subscriptions;
                        if ((command.limit == null) || (typeof command.limit != 'number')) {
                            // Send the list of all events for this session
                            db.GetEvents(filter, domain.id, function (err, docs) {
                                if (err != null) return;
                                try { ws.send(JSON.stringify({ action: 'events', events: docs, user: command.user, tag: command.tag })); } catch (ex) { }
                            });
                        } else {
                            // Send the list of most recent events for this session, up to 'limit' count
                            db.GetEventsWithLimit(filter, domain.id, command.limit, function (err, docs) {
                                if (err != null) return;
                                try { ws.send(JSON.stringify({ action: 'events', events: docs, user: command.user, tag: command.tag })); } catch (ex) { }
                            });
                        }
                    }
                    break;
                }
            case 'clearevents':
                {
                    // Delete all events
                    if (user.siteadmin != 0xFFFFFFFF) break;
                    db.RemoveAllEvents(domain.id);
                    parent.parent.DispatchEvent(['*', 'server-global'], obj, { action: 'clearevents', nolog: 1, domain: domain.id });
                    break;
                }
            case 'users':
                {
                    // Request a list of all users
                    if ((user.siteadmin & 2) == 0) break;
                    var docs = [];
                    for (i in parent.users) {
                        if ((parent.users[i].domain == domain.id) && (parent.users[i].name != '~')) {
                            docs.push(parent.CloneSafeUser(parent.users[i]));
                        }
                    }
                    try { ws.send(JSON.stringify({ action: 'users', users: docs, tag: command.tag })); } catch (ex) { }
                    break;
                }
            case 'changeemail':
                {
                    // Change the email address
                    if (domain.auth == 'sspi') return;
                    if (common.validateEmail(command.email, 1, 256) == false) return;
                    if (parent.users[req.session.userid].email != command.email) {
                        // Check if this email is already validated on a different account
                        db.GetUserWithVerifiedEmail(domain.id, command.email, function (err, docs) {
                            if (docs.length > 0) {
                                // Notify the duplicate email error
                                try { ws.send(JSON.stringify({ action: 'msg', type: 'notify', value: 'Failed to change email address, another account already using: <b>' + EscapeHtml(command.email) + '</b>.' })); } catch (ex) { }
                            } else {
                                // Update the user's email
                                var oldemail = user.email;
                                user.email = command.email;
                                user.emailVerified = false;
                                parent.db.SetUser(user);

                                // Event the change
                                var message = { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', domain: domain.id };
                                if (oldemail != null) {
                                    message.msg = 'Changed email of user ' + user.name + ' from ' + oldemail + ' to ' + user.email;
                                } else {
                                    message.msg = 'Set email of user ' + user.name + ' to ' + user.email;
                                }
                                parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, message);

                                // Send the verification email
                                if ((parent.parent.mailserver != null) && (domain.auth != 'sspi')) { parent.parent.mailserver.sendAccountCheckMail(domain, user.name, user.email); }
                            }
                        });
                    }
                    break;
                }
            case 'verifyemail':
                {
                    // Send a account email verification email
                    if (domain.auth == 'sspi') return;
                    if (common.validateString(command.email, 3, 1024) == false) return;
                    if ((parent.parent.mailserver != null) && (parent.users[req.session.userid].email == command.email)) {
                        // Send the verification email
                        parent.parent.mailserver.sendAccountCheckMail(domain, user.name, user.email);
                    }
                    break;
                }
            case 'wssessioncount':
                {
                    // Request a list of all web socket user session count
                    var wssessions = {};
                    if ((user.siteadmin & 2) == 0) break;
                    if (parent.parent.multiServer == null) {
                        // No peering, use simple session counting
                        for (i in parent.wssessions) { if (parent.wssessions[i][0].domainid == domain.id) { wssessions[i] = parent.wssessions[i].length; } }
                    } else {
                        // We have peer servers, use more complex session counting
                        for (i in parent.sessionsCount) { if (i.split('/')[1] == domain.id) { wssessions[i] = parent.sessionsCount[i]; } }
                    }
                    try { ws.send(JSON.stringify({ action: 'wssessioncount', wssessions: wssessions, tag: command.tag })); } catch (ex) { } // wssessions is: userid --> count
                    break;
                }
            case 'deleteuser':
                {
                    // Delete a user account
                    if ((user.siteadmin & 2) == 0) break;
                    if (common.validateString(command.userid, 1, 2048) == false) break;
                    var delusersplit = command.userid.split('/'), deluserid = command.userid, deluser = parent.users[deluserid];
                    if ((deluser == null) || (delusersplit.length != 3) || (delusersplit[1] != domain.id)) break; // Invalid domain, operation only valid for current domain
                    if ((deluser.siteadmin != null) && (deluser.siteadmin > 0) && (user.siteadmin != 0xFFFFFFFF)) break; // Need full admin to remote another administrator

                    // Remove all the mesh links to this user
                    if (deluser.links != null) {
                        for (meshid in deluser.links) {
                            // Get the mesh
                            mesh = parent.meshes[meshid];
                            if (mesh) {
                                // Remove user from the mesh
                                if (mesh.links[deluser._id] != null) { delete mesh.links[deluser._id]; parent.db.Set(mesh); }
                                // Notify mesh change
                                change = 'Removed user ' + deluser.name + ' from group ' + mesh.name;
                                parent.parent.DispatchEvent(['*', mesh._id, deluser._id, user._id], obj, { etype: 'mesh', username: user.name, userid: user._id, meshid: mesh._id, name: mesh.name, mtype: mesh.mtype, desc: mesh.desc, action: 'meshchange', links: mesh.links, msg: change, domain: domain.id });
                            }
                        }
                    }

                    // Remove notes for this user
                    db.Remove('nt' + deluser._id);

                    // Delete all files on the server for this account
                    try {
                        var deluserpath = parent.getServerRootFilePath(deluser);
                        if (deluserpath != null) { parent.deleteFolderRec(deluserpath); }
                    } catch (e) { }

                    db.Remove(deluserid);
                    delete parent.users[deluserid];
                    parent.parent.DispatchEvent(['*', 'server-users'], obj, { etype: 'user', userid: deluserid, username: deluser.name, action: 'accountremove', msg: 'Account removed', domain: domain.id });
                    parent.parent.DispatchEvent([deluserid], obj, 'close');

                    break;
                }
            case 'userbroadcast':
                {
                    // Broadcast a message to all currently connected users.
                    if ((user.siteadmin & 2) == 0) break;
                    if (common.validateString(command.msg, 1, 256) == false) break; // Notification message is between 1 and 256 characters

                    // Create the notification message
                    var notification = { action: "msg", type: "notify", domain: domain.id, "value": command.msg };

                    // Send the notification on all user sessions for this server
                    for (var i in parent.wssessions2) {
                        try {
                            if (parent.wssessions2[i].domainid == domain.id) { parent.wssessions2[i].send(JSON.stringify(notification)); }
                        } catch (ex) { }
                    }

                    // TODO: Notify all sessions on other peers.

                    break;
                }
            case 'adduser':
                {
                    // Add a new user account
                    if ((user.siteadmin & 2) == 0) break;
                    if (common.validateUsername(command.username, 1, 64) == false) break; // Username is between 1 and 64 characters, no spaces
                    if (common.validateString(command.pass, 1, 256) == false) break; // Password is between 1 and 256 characters
                    if (common.checkPasswordRequirements(command.pass, domain.passwordrequirements) == false) break; // Password does not meet requirements
                    if ((command.email != null) && (common.validateEmail(command.email, 1, 256) == false)) break; // Check if this is a valid email address
                    var newusername = command.username, newuserid = 'user/' + domain.id + '/' + command.username.toLowerCase();
                    if (newusername == '~') break; // This is a reserved user name
                    if (parent.users[newuserid]) break; // Account already exists

                    // Check if we exceed the maximum number of user accounts
                    db.isMaxType(domain.limits.maxuseraccounts, 'user', domain.id, function (maxExceed) {
                        if (maxExceed) {
                            // Account count exceed, do notification

                            // Create the notification message
                            var notification = { action: "msg", type: "notify", value: "Account limit reached.", userid: user._id, username: user.name, domain: domain.id };

                            // Get the list of sessions for this user
                            var sessions = parent.wssessions[user._id];
                            if (sessions != null) { for (i in sessions) { try { if (sessions[i].domainid == domain.id) { sessions[i].send(JSON.stringify(notification)); } } catch (ex) { } } }
                            // TODO: Notify all sessions on other peers.
                        } else {
                            // Check if this is an existing user
                            var newuser = { type: 'user', _id: newuserid, name: newusername, creation: Math.floor(Date.now() / 1000), domain: domain.id };
                            if (command.email != null) { newuser.email = command.email; } // Email
                            if (command.resetNextLogin === true) { newuser.passchange = -1; } else { newuser.passchange = Math.floor(Date.now() / 1000); }
                            parent.users[newuserid] = newuser;

                            // Create a user, generate a salt and hash the password
                            require('./pass').hash(command.pass, function (err, salt, hash) {
                                if (err) throw err;
                                newuser.salt = salt;
                                newuser.hash = hash;
                                db.SetUser(newuser);
                                parent.parent.DispatchEvent(['*', 'server-users'], obj, { etype: 'user', username: newusername, account: parent.CloneSafeUser(newuser), action: 'accountcreate', msg: 'Account created, email is ' + command.email, domain: domain.id });
                            });
                        }
                    });
                    break;
                }
            case 'edituser':
                {
                    // Edit a user account, may involve changing email or administrator permissions
                    if (((user.siteadmin & 2) != 0) || (user.name == command.name)) {
                        var chguserid = 'user/' + domain.id + '/' + command.name.toLowerCase(), chguser = parent.users[chguserid];
                        change = 0;
                        if (chguser) {
                            if (common.validateString(command.email, 1, 256) && (chguser.email != command.email)) { chguser.email = command.email; change = 1; }
                            if ((command.emailVerified === true || command.emailVerified === false) && (chguser.emailVerified != command.emailVerified)) { chguser.emailVerified = command.emailVerified; change = 1; }
                            if ((common.validateInt(command.quota, 0) || command.quota == null) && (command.quota != chguser.quota)) { chguser.quota = command.quota; if (chguser.quota == null) { delete chguser.quota; } change = 1; }
                            if ((user.siteadmin == 0xFFFFFFFF) && common.validateInt(command.siteadmin) && (chguser.siteadmin != command.siteadmin)) { chguser.siteadmin = command.siteadmin; change = 1; }
                            if (change == 1) {
                                db.SetUser(chguser);
                                parent.parent.DispatchEvent([chguser._id], obj, 'resubscribe');
                                parent.parent.DispatchEvent(['*', 'server-users', user._id, chguser._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(chguser), action: 'accountchange', msg: 'Account changed: ' + command.name, domain: domain.id });
                            }
                            if ((chguser.siteadmin) && (chguser.siteadmin != 0xFFFFFFFF) && (chguser.siteadmin & 32)) {
                                parent.parent.DispatchEvent([chguser._id], obj, 'close'); // Disconnect all this user's sessions
                            }
                        }
                    }
                    break;
                }
            case 'changepassword':
                {
                    // Change our own password
                    if (common.validateString(command.oldpass, 1, 256) == false) break;
                    if (common.validateString(command.newpass, 1, 256) == false) break;
                    if ((command.hint != null) && (common.validateString(command.hint, 0, 256) == false)) break;
                    if (common.checkPasswordRequirements(command.newpass, domain.passwordrequirements) == false) break; // Password does not meet requirements

                    // Start by checking the old password
                    parent.checkUserPassword(domain, user, command.oldpass, function (result) {
                        if (result == true) {
                            // Update the password
                            require('./pass').hash(command.newpass, function (err, salt, hash) {
                                if (err) {
                                    // Send user notification of error
                                    displayNotificationMessage('Error, password not changed.');
                                } else {
                                    // Change the password
                                    if ((domain.passwordrequirements != null) && (domain.passwordrequirements.hint === true) && (command.hint != null)) {
                                        var hint = command.hint;
                                        if (hint.length > 250) { hint = hint.substring(0, 250); }
                                        user.passhint = hint;
                                    }
                                    user.salt = salt;
                                    user.hash = hash;
                                    user.passchange = Math.floor(Date.now() / 1000);
                                    delete user.passtype;
                                    db.SetUser(user);
                                    parent.parent.DispatchEvent(['*', 'server-users'], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Account password changed: ' + user.name, domain: domain.id });

                                    // Send user notification of password change
                                    displayNotificationMessage('Password changed.');
                                }
                            });
                        } else {
                            // Send user notification of error
                            displayNotificationMessage('Current password not correct.');
                        }
                    });
                    break;
                }
            case 'changeuserpass':
                {
                    // Change a user's password
                    if (user.siteadmin != 0xFFFFFFFF) break;
                    if (common.validateString(command.user, 1, 256) == false) break;
                    if (common.validateString(command.pass, 1, 256) == false) break;
                    if ((command.hint != null) && (common.validateString(command.hint, 0, 256) == false)) break;
                    if (typeof command.removeMultiFactor != 'boolean') break;
                    if (common.checkPasswordRequirements(command.pass, domain.passwordrequirements) == false) break; // Password does not meet requirements

                    var chguser = parent.users['user/' + domain.id + '/' + command.user.toLowerCase()];
                    if (chguser) {
                        // Compute the password hash & save it
                        require('./pass').hash(command.pass, function (err, salt, hash) {
                            if (!err) {
                                chguser.salt = salt;
                                chguser.hash = hash;
                                if ((domain.passwordrequirements != null) && (domain.passwordrequirements.hint === true) && (command.hint != null)) {
                                    var hint = command.hint;
                                    if (hint.length > 250) { hint = hint.substring(0, 250); }
                                    chguser.passhint = hint;
                                }
                                if (command.resetNextLogin === true) { chguser.passchange = -1; } else { chguser.passchange = Math.floor(Date.now() / 1000); }
                                delete chguser.passtype; // Remove the password type if one was present.
                                if (command.removeMultiFactor == true) {
                                    if (chguser.otpsecret) { delete chguser.otpsecret; }
                                    if (chguser.otphkeys) { delete chguser.otphkeys; }
                                    if (chguser.otpkeys) { delete chguser.otpkeys; }
                                }
                                db.SetUser(chguser);
                                parent.parent.DispatchEvent(['*', 'server-users', user._id, chguser._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(chguser), action: 'accountchange', msg: 'Changed account credentials.', domain: domain.id });
                            } else {
                                // Report that the password change failed
                                // TODO
                            }
                        });
                    }
                    break;
                }
            case 'notifyuser':
                {
                    // Send a notification message to a user
                    if ((user.siteadmin & 2) == 0) break;
                    if (common.validateString(command.userid, 1, 2048) == false) break;
                    if (common.validateString(command.msg, 1, 4096) == false) break;

                    // Create the notification message
                    var notification = { "action": "msg", "type": "notify", "value": "<b>" + user.name + "</b>: " + EscapeHtml(command.msg), "userid": user._id, "username": user.name };

                    // Get the list of sessions for this user
                    var sessions = parent.wssessions[command.userid];
                    if (sessions != null) { for (i in sessions) { try { sessions[i].send(JSON.stringify(notification)); } catch (ex) { } } }

                    if (parent.parent.multiServer != null) {
                        // TODO: Add multi-server support
                    }
                    break;
                }
            case 'meshmessenger':
                {
                    // Send a notification message to a user
                    if ((user.siteadmin & 2) == 0) break;

                    // Setup a user-to-user session
                    if (common.validateString(command.userid, 1, 2048)) {

                        // Create the notification message
                        var notification = {
                            "action": "msg", "type": "notify", "value": "<b>" + user.name + "</b>: Chat Request, Click here to accept.", "userid": user._id, "username": user.name, "tag": 'meshmessenger/' + encodeURIComponent(command.userid) + '/' + encodeURIComponent(user._id)
                        };

                        // Get the list of sessions for this user
                        var sessions = parent.wssessions[command.userid];
                        if (sessions != null) { for (i in sessions) { try { sessions[i].send(JSON.stringify(notification)); } catch (ex) { } } }

                        if (parent.parent.multiServer != null) {
                            // TODO: Add multi-server support
                        }
                    }

                    // Setup a user-to-node session
                    if (common.validateString(command.nodeid, 1, 2048)) {
                        if (args.lanonly == true) { return; } // User-to-device chat is not support in LAN-only mode yet. We need the agent to replace the IP address of the server??

                        // Create the server url
                        var httpsPort = ((args.aliasport == null) ? args.port : args.aliasport); // Use HTTPS alias port is specified
                        var xdomain = (domain.dns == null) ? domain.id : '';
                        if (xdomain != '') xdomain += "/";
                        var url = "http" + (args.notls ? '' : 's') + "://" + parent.getWebServerName(domain) + ":" + httpsPort + "/" + xdomain + "messenger?id=meshmessenger/" + encodeURIComponent(command.nodeid) + "/" + encodeURIComponent(user._id) + "&title=" + encodeURIComponent(user.name);

                        // Create the notification message
                        routeCommandToNode({ "action": "openUrl", "nodeid": command.nodeid, "userid": user._id, "username": user.name, "url": url });
                    }

                    break;
                }
            case 'serverversion':
                {
                    // Check the server version
                    if ((user.siteadmin & 16) == 0) break;
                    parent.parent.getLatestServerVersion(function (currentVersion, latestVersion) { try { ws.send(JSON.stringify({ action: 'serverversion', current: currentVersion, latest: latestVersion })); } catch (ex) { } });
                    break;
                }
            case 'serverupdate':
                {
                    // Perform server update
                    if ((user.siteadmin & 16) == 0) break;
                    parent.parent.performServerUpdate();
                    break;
                }
            case 'servererrors':
                {
                    // Load the server error log
                    if ((user.siteadmin & 16) == 0) break;
                    fs.readFile(parent.parent.getConfigFilePath('mesherrors.txt'), 'utf8', function (err, data) { try { ws.send(JSON.stringify({ action: 'servererrors', data: data })); } catch (ex) { } });
                    break;
                }
            case 'serverclearerrorlog':
                {
                    // Clear the server error log
                    if ((user.siteadmin & 16) == 0) break;
                    fs.unlink(parent.parent.getConfigFilePath('mesherrors.txt'), function (err) { });
                    break;
                }
            case 'createmesh':
                {
                    // Check if we have new group restriction
                    if ((user.siteadmin != 0xFFFFFFFF) && ((user.siteadmin & 64) != 0)) break;

                    // In some situations, we need a verified email address to create a device group.
                    if ((parent.parent.mailserver != null) && (domain.auth != 'sspi') && (user.emailVerified !== true) && (user.siteadmin != 0xFFFFFFFF)) return; // User must verify it's email first.

                    // Create mesh
                    if (common.validateString(command.meshname, 1, 64) == false) break; // Meshname is between 1 and 64 characters
                    if (common.validateString(command.desc, 0, 1024) == false) break; // Mesh description is between 0 and 1024 characters

                    // We only create Agent-less Intel AMT mesh (Type1), or Agent mesh (Type2)
                    if ((command.meshtype == 1) || (command.meshtype == 2)) {
                        parent.crypto.randomBytes(48, function (err, buf) {
                            meshid = 'mesh/' + domain.id + '/' + buf.toString('base64').replace(/\+/g, '@').replace(/\//g, '$');
                            var links = {};
                            links[user._id] = { name: user.name, rights: 0xFFFFFFFF };
                            mesh = { type: 'mesh', _id: meshid, name: command.meshname, mtype: command.meshtype, desc: command.desc, domain: domain.id, links: links };
                            db.Set(common.escapeLinksFieldName(mesh));
                            parent.meshes[meshid] = mesh;
                            parent.parent.AddEventDispatch([meshid], ws);
                            if (user.links == null) user.links = {};
                            user.links[meshid] = { rights: 0xFFFFFFFF };
                            user.subscriptions = parent.subscribe(user._id, ws);
                            db.SetUser(user);
                            parent.parent.DispatchEvent(['*', meshid, user._id], obj, { etype: 'mesh', username: user.name, meshid: meshid, name: command.meshname, mtype: command.meshtype, desc: command.desc, action: 'createmesh', links: links, msg: 'Mesh created: ' + command.meshname, domain: domain.id });
                        });
                    }
                    break;
                }
            case 'deletemesh':
                {
                    // Delete a mesh and all computers within it
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check the meshid
                    db.Get(command.meshid, function (err, meshes) {
                        if (meshes.length != 1) return;
                        var mesh = common.unEscapeLinksFieldName(meshes[0]);

                        // Check if this user has rights to do this
                        if (mesh.links[user._id] == null || mesh.links[user._id].rights != 0xFFFFFFFF) return;
                        if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                        // Fire the removal event first, because after this, the event will not route
                        parent.parent.DispatchEvent(['*', command.meshid], obj, { etype: 'mesh', username: user.name, meshid: command.meshid, name: command.meshname, action: 'deletemesh', msg: 'Mesh deleted: ' + command.meshname, domain: domain.id });

                        // Remove all user links to this mesh
                        for (i in meshes) {
                            var links = meshes[i].links;
                            for (var j in links) {
                                var xuser = parent.users[j];
                                if (xuser && xuser.links) {
                                    delete xuser.links[meshes[i]._id];
                                    db.SetUser(xuser);
                                    parent.parent.DispatchEvent([xuser._id], obj, 'resubscribe');
                                }
                            }
                        }

                        // Delete all files on the server for this mesh
                        try {
                            var meshpath = parent.getServerRootFilePath(mesh);
                            if (meshpath != null) { parent.deleteFolderRec(meshpath); }
                        } catch (e) { }

                        parent.parent.RemoveEventDispatchId(command.meshid); // Remove all subscriptions to this mesh

                        // Mark the mesh as deleted
                        var dbmesh = meshes[0];
                        dbmesh.deleted = new Date(); // Mark the time this mesh was deleted, we can expire it at some point.
                        db.Set(common.escapeLinksFieldName(mesh)); // We don't really delete meshes because if a device connects to is again, we will up-delete it.
                        parent.meshes[command.meshid] = mesh; // Update the mesh in memory;

                        // Delete all devices attached to this mesh in the database
                        db.RemoveMeshDocuments(command.meshid);
                    });
                    break;
                }
            case 'editmesh':
                {
                    // Change the name or description of a mesh
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check the meshid
                    mesh = parent.meshes[command.meshid];
                    change = '';
                    if (mesh) {
                        // Check if this user has rights to do this
                        if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 1) == 0)) return;
                        if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                        if ((common.validateString(command.meshname, 1, 64) == true) && (command.meshname != mesh.name)) { change = 'Group name changed from "' + mesh.name + '" to "' + command.meshname + '"'; mesh.name = command.meshname; }
                        if ((common.validateString(command.desc, 0, 1024) == true) && (command.desc != mesh.desc)) { if (change != '') change += ' and description changed'; else change += 'Group "' + mesh.name + '" description changed'; mesh.desc = command.desc; }
                        if ((common.validateInt(command.flags) == true) && (command.flags != mesh.flags)) { if (change != '') change += ' and flags changed'; else change += 'Group "' + mesh.name + '" flags changed'; mesh.flags = command.flags; }
                        if (change != '') { db.Set(common.escapeLinksFieldName(mesh)); parent.parent.DispatchEvent(['*', mesh._id, user._id], obj, { etype: 'mesh', username: user.name, meshid: mesh._id, name: mesh.name, mtype: mesh.mtype, desc: mesh.desc, flags: mesh.flags, action: 'meshchange', links: mesh.links, msg: change, domain: domain.id }); }
                    }
                    break;
                }
            case 'addmeshuser':
                {
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check the meshid
                    if (common.validateString(command.username, 1, 64) == false) break; // Username is between 1 and 64 characters
                    if (common.validateInt(command.meshadmin) == false) break; // Mesh rights must be an integer

                    // Check if the user exists
                    var newuserid = 'user/' + domain.id + '/' + command.username.toLowerCase(), newuser = parent.users[newuserid];
                    if (newuser == null) {
                        // TODO: Send error back, user not found.
                        break;
                    }

                    // Get the mesh
                    mesh = parent.meshes[command.meshid];
                    if (mesh) {
                        // Check if this user has rights to do this
                        if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 2) == 0)) return;
                        if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                        // Add mesh to user
                        if (newuser.links == null) newuser.links = {};
                        newuser.links[command.meshid] = { rights: command.meshadmin };
                        db.SetUser(newuser);
                        parent.parent.DispatchEvent([newuser._id], obj, 'resubscribe');

                        // Add a user to the mesh
                        mesh.links[newuserid] = { name: newuser.name, rights: command.meshadmin };
                        db.Set(common.escapeLinksFieldName(mesh));

                        // Notify mesh change
                        parent.parent.DispatchEvent(['*', mesh._id, user._id, newuserid], obj, { etype: 'mesh', username: newuser.name, userid: command.userid, meshid: mesh._id, name: mesh.name, mtype: mesh.mtype, desc: mesh.desc, action: 'meshchange', links: mesh.links, msg: 'Added user ' + newuser.name + ' to mesh ' + mesh.name, domain: domain.id });
                    }
                    break;
                }
            case 'removemeshuser':
                {
                    if (common.validateString(command.userid, 1, 1024) == false) break; // Check userid
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check meshid
                    if ((command.userid.split('/').length != 3) || (command.userid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                    // Get the mesh
                    mesh = parent.meshes[command.meshid];
                    if (mesh) {
                        // Check if this user has rights to do this
                        if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 2) == 0)) return;

                        // Check if the user exists - Just in case we need to delete a mesh right for a non-existant user, we do it this way. Technically, it's not possible, but just in case.
                        var deluserid = command.userid, deluser = parent.users[deluserid];
                        if (deluser != null) {
                            // Remove mesh from user
                            if (deluser.links != null && deluser.links[command.meshid] != null) {
                                var delmeshrights = deluser.links[command.meshid].rights;
                                if ((delmeshrights == 0xFFFFFFFF) && (mesh.links[deluserid].rights != 0xFFFFFFFF)) return; // A non-admin can't kick out an admin
                                delete deluser.links[command.meshid];
                                db.Set(deluser);
                                parent.parent.DispatchEvent([deluser._id], obj, 'resubscribe');
                            }
                        }

                        // Remove user from the mesh
                        if (mesh.links[command.userid] != null) {
                            delete mesh.links[command.userid];
                            db.Set(common.escapeLinksFieldName(mesh));

                            // Notify mesh change
                            if (deluser != null) {
                                parent.parent.DispatchEvent(['*', mesh._id, user._id, command.userid], obj, { etype: 'mesh', username: user.name, userid: deluser.name, meshid: mesh._id, name: mesh.name, mtype: mesh.mtype, desc: mesh.desc, action: 'meshchange', links: mesh.links, msg: 'Removed user ' + deluser.name + ' from group ' + mesh.name, domain: domain.id });
                            } else {
                                parent.parent.DispatchEvent(['*', mesh._id, user._id, command.userid], obj, { etype: 'mesh', username: user.name, userid: (deluserid.split('/')[2]), meshid: mesh._id, name: mesh.name, mtype: mesh.mtype, desc: mesh.desc, action: 'meshchange', links: mesh.links, msg: 'Removed user ' + (deluserid.split('/')[2]) + ' from group ' + mesh.name, domain: domain.id });
                            }
                        }
                    }
                    break;
                }
            case 'meshamtpolicy':
                {
                    // Change a mesh Intel AMT policy
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check the meshid
                    if (common.validateObject(command.amtpolicy) == false) break; // Check the amtpolicy
                    if (common.validateInt(command.amtpolicy.type, 0, 2) == false) break; // Check the amtpolicy.type
                    if (command.amtpolicy.type === 2) {
                        if (common.validateString(command.amtpolicy.password, 0, 32) == false) break; // Check the amtpolicy.password
                        if (common.validateInt(command.amtpolicy.badpass, 0, 1) == false) break; // Check the amtpolicy.badpass
                        if (common.validateInt(command.amtpolicy.cirasetup, 0, 2) == false) break; // Check the amtpolicy.cirasetup
                    }
                    mesh = parent.meshes[command.meshid];
                    change = '';
                    if (mesh) {
                        // Check if this user has rights to do this
                        if ((mesh.links[user._id] == null) || (mesh.links[user._id].rights != 0xFFFFFFFF)) return;
                        if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                        // TODO: Check if this is a change from the existing policy

                        // Perform the Intel AMT policy change
                        change = 'Intel AMT policy change';
                        var amtpolicy = { type: command.amtpolicy.type };
                        if (command.amtpolicy.type === 2) { amtpolicy = { type: command.amtpolicy.type, password: command.amtpolicy.password, badpass: command.amtpolicy.badpass, cirasetup: command.amtpolicy.cirasetup }; }
                        mesh.amt = amtpolicy;
                        db.Set(common.escapeLinksFieldName(mesh));
                        parent.parent.DispatchEvent(['*', mesh._id, user._id], obj, { etype: 'mesh', username: user.name, meshid: mesh._id, amt: amtpolicy, action: 'meshchange', links: mesh.links, msg: change, domain: domain.id });

                        // Send new policy to all computers on this mesh
                        //routeCommandToMesh(command.meshid, { action: 'amtPolicy', amtPolicy: amtpolicy });

                        // See if the node is connected
                        for (var nodeid in parent.wsagents) {
                            const agent = parent.wsagents[nodeid];
                            if (agent.dbMeshKey == command.meshid) { agent.sendUpdatedIntelAmtPolicy(amtpolicy); }
                        }
                    }
                    break;
                }
            case 'addamtdevice':
                {
                    if (args.wanonly == true) return; // This is a WAN-only server, local Intel AMT computers can't be added
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check meshid
                    if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain
                    if (common.validateString(command.devicename, 1, 256) == false) break; // Check device name
                    if (common.validateString(command.hostname, 1, 256) == false) break; // Check hostname
                    if (common.validateString(command.amtusername, 0, 16) == false) break; // Check username
                    if (common.validateString(command.amtpassword, 0, 16) == false) break; // Check password
                    if (command.amttls == '0') { command.amttls = 0; } else if (command.amttls == '1') { command.amttls = 1; } // Check TLS flag
                    if ((command.amttls != 1) && (command.amttls != 0)) break;

                    // If we are in WAN-only mode, hostname is not used
                    if ((args.wanonly == true) && (command.hostname)) { delete command.hostname; }

                    // Get the mesh
                    mesh = parent.meshes[command.meshid];
                    if (mesh) {
                        if (mesh.mtype != 1) return; // This operation is only allowed for mesh type 1, Intel AMT agentless mesh.

                        // Check if this user has rights to do this
                        if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 4) == 0)) return;

                        // Create a new nodeid
                        parent.crypto.randomBytes(48, function (err, buf) {
                            // create the new node
                            nodeid = 'node/' + domain.id + '/' + buf.toString('base64').replace(/\+/g, '@').replace(/\//g, '$');
                            var device = { type: 'node', mtype: 1, _id: nodeid, meshid: command.meshid, name: command.devicename, host: command.hostname, domain: domain.id, intelamt: { user: command.amtusername, pass: command.amtpassword, tls: command.amttls } };
                            db.Set(device);

                            // Event the new node
                            var device2 = common.Clone(device);
                            delete device2.intelamt.pass; // Remove the Intel AMT password before eventing this.
                            parent.parent.DispatchEvent(['*', command.meshid], obj, { etype: 'node', username: user.name, action: 'addnode', node: device2, msg: 'Added device ' + command.devicename + ' to mesh ' + mesh.name, domain: domain.id });
                        });
                    }
                    break;
                }
            case 'scanamtdevice':
                {
                    if (args.wanonly == true) return; // This is a WAN-only server, this type of scanning is not allowed.
                    if (common.validateString(command.range, 1, 256) == false) break; // Check range string

                    // Ask the RMCP scanning to scan a range of IP addresses
                    if (parent.parent.amtScanner) {
                        if (parent.parent.amtScanner.performRangeScan(user._id, command.range) == false) {
                            parent.parent.DispatchEvent(['*', user._id], obj, { action: 'scanamtdevice', range: command.range, results: null, nolog: 1 });
                        }
                    }
                    break;
                }
            case 'changeDeviceMesh':
                {
                    if (common.validateStrArray(command.nodeids, 1, 256) == false) break; // Check nodeid strings
                    if (common.validateString(command.meshid, 1, 256) == false) break; // Check target meshid string

                    // For each nodeid, change the group
                    for (var i = 0; i < command.nodeids.length; i++) {
                        db.Get(command.nodeids[i], function (err, nodes) {
                            if (nodes.length != 1) return;
                            const node = nodes[0];

                            // Check if already in the right mesh
                            if (node.meshid == command.meshid) return;

                            // Make sure both source and target mesh are the same type
                            try { if (parent.meshes[node.meshid].mtype != parent.meshes[command.meshid].mtype) return; } catch (e) { return; };

                            // Make sure that we have rights on both source and destination mesh
                            const sourceMeshRights = user.links[node.meshid].rights;
                            const targetMeshRights = user.links[command.meshid].rights;
                            if (((sourceMeshRights & 4) == 0) || ((targetMeshRights & 4) == 0)) return;

                            // Perform the switch, start by saving the node with the new meshid.
                            const oldMeshId = node.meshid;
                            node.meshid = command.meshid;
                            db.Set(node);

                            // If the device is connected on this server, switch it now.
                            var agentSession = parent.wsagents[node._id];
                            if (agentSession != null) {
                                agentSession.dbMeshKey = command.meshid; // Switch the agent mesh
                                agentSession.meshid = command.meshid.split('/')[2]; // Switch the agent mesh
                                agentSession.sendUpdatedIntelAmtPolicy(); // Send the new Intel AMT policy
                            }

                            // Add the connection state
                            const state = parent.parent.GetConnectivityState(node._id);
                            if (state) {
                                node.conn = state.connectivity;
                                node.pwr = state.powerState;
                                if ((state.connectivity & 1) != 0) { var agent = parent.wsagents[node._id]; if (agent != null) { node.agct = agent.connectTime; } }
                                if ((state.connectivity & 2) != 0) { var cira = parent.parent.mpsserver.ciraConnections[node._id]; if (cira != null) { node.cict = cira.tag.connectTime; } }
                            }

                            // Event the node change
                            var newMesh = parent.meshes[command.meshid];
                            parent.parent.DispatchEvent(['*', oldMeshId, command.meshid], obj, { etype: 'node', username: user.name, action: 'nodemeshchange', nodeid: node._id, node: node, oldMeshId: oldMeshId, newMeshId: command.meshid, msg: 'Moved device ' + node.name + ' to group ' + newMesh.name, domain: domain.id });
                        });
                    }
                    break;
                }
            case 'removedevices':
                {
                    if (common.validateArray(command.nodeids, 1) == false) break; // Check nodeid's

                    for (i in command.nodeids) {
                        nodeid = command.nodeids[i];
                        if (common.validateString(nodeid, 1, 1024) == false) break; // Check nodeid
                        if ((nodeid.split('/').length != 3) || (nodeid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                        // Get the device
                        db.Get(nodeid, function (err, nodes) {
                            if (nodes.length != 1) return;
                            var node = nodes[0];

                            // Get the mesh for this device
                            mesh = parent.meshes[node.meshid];
                            if (mesh) {
                                // Check if this user has rights to do this
                                if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 4) == 0)) return;

                                // Delete this node including network interface information, events and timeline
                                db.Remove(node._id);                            // Remove node with that id
                                db.Remove('if' + node._id);                     // Remove interface information
                                db.Remove('nt' + node._id);                     // Remove notes
                                db.Remove('lc' + node._id);                     // Remove last connect time
                                db.RemoveSMBIOS(node._id);                      // Remove SMBios data
                                db.RemoveAllNodeEvents(node._id);               // Remove all events for this node
                                db.removeAllPowerEventsForNode(node._id);       // Remove all power events for this node

                                // Event node deletion
                                parent.parent.DispatchEvent(['*', node.meshid], obj, { etype: 'node', username: user.name, action: 'removenode', nodeid: node._id, msg: 'Removed device ' + node.name + ' from group ' + mesh.name, domain: domain.id });

                                // Disconnect all connections if needed
                                var state = parent.parent.GetConnectivityState(nodeid);
                                if ((state != null) && (state.connectivity != null)) {
                                    if ((state.connectivity & 1) != 0) { parent.wsagents[nodeid].close(); } // Disconnect mesh agent
                                    if ((state.connectivity & 2) != 0) { parent.parent.mpsserver.close(parent.parent.mpsserver.ciraConnections[nodeid]); } // Disconnect CIRA connection
                                }
                            }
                        });
                    }

                    break;
                }
            case 'wakedevices':
                {
                    if (common.validateArray(command.nodeids, 1) == false) break; // Check nodeid's
                    // TODO: We can optimize this a lot.
                    // - We should get a full list of all MAC's to wake first.
                    // - We should try to only have one agent per subnet (using Gateway MAC) send a wake-on-lan.
                    for (i in command.nodeids) {
                        nodeid = command.nodeids[i];
                        var wakeActions = 0;
                        if (common.validateString(nodeid, 1, 1024) == false) break; // Check nodeid
                        if ((nodeid.split('/').length == 3) && (nodeid.split('/')[1] == domain.id)) { // Validate the domain, operation only valid for current domain
                            // Get the device
                            db.Get(nodeid, function (err, nodes) {
                                if (nodes.length != 1) return;
                                var node = nodes[0];

                                // Get the mesh for this device
                                mesh = parent.meshes[node.meshid];
                                if (mesh) {

                                    // Check if this user has rights to do this
                                    if (mesh.links[user._id] != null && ((mesh.links[user._id].rights & 64) != 0)) {

                                        // Get the device interface information
                                        db.Get('if' + node._id, function (err, nodeifs) {
                                            if (nodeifs.length == 1) {
                                                var nodeif = nodeifs[0];
                                                var macs = [];
                                                for (var i in nodeif.netif) { if (nodeif.netif[i].mac) { macs.push(nodeif.netif[i].mac); } }

                                                // Have the server send a wake-on-lan packet (Will not work in WAN-only)
                                                if (parent.parent.meshScanner != null) { parent.parent.meshScanner.wakeOnLan(macs); wakeActions++; }

                                                // Get the list of mesh this user as access to
                                                var targetMeshes = [];
                                                for (i in user.links) { targetMeshes.push(i); }

                                                // Go thru all the connected agents and send wake-on-lan on all the ones in the target mesh list
                                                for (i in parent.wsagents) {
                                                    var agent = parent.wsagents[i];
                                                    if ((targetMeshes.indexOf(agent.dbMeshKey) >= 0) && (agent.authenticated == 2)) {
                                                        //console.log('Asking agent ' + agent.dbNodeKey + ' to wake ' + macs.join(','));
                                                        try { agent.send(JSON.stringify({ action: 'wakeonlan', macs: macs })); } catch (ex) { }
                                                        wakeActions++;
                                                    }
                                                }
                                            }
                                        });

                                    }
                                }
                            });
                        }
                        // Confirm we may be doing something (TODO)
                        try { ws.send(JSON.stringify({ action: 'wakedevices' })); } catch (ex) { }
                    }

                    break;
                }
            case 'poweraction':
                {
                    if (common.validateArray(command.nodeids, 1) == false) break; // Check nodeid's
                    for (i in command.nodeids) {
                        nodeid = command.nodeids[i];
                        var powerActions = 0;
                        if (common.validateString(nodeid, 1, 1024) == false) break; // Check nodeid
                        if ((nodeid.split('/').length == 3) && (nodeid.split('/')[1] == domain.id)) { // Validate the domain, operation only valid for current domain
                            // Get the device
                            db.Get(nodeid, function (err, nodes) {
                                if (nodes.length != 1) return;
                                var node = nodes[0];

                                // Get the mesh for this device
                                mesh = parent.meshes[node.meshid];
                                if (mesh) {

                                    // Check if this user has rights to do this
                                    if (mesh.links[user._id] != null && ((mesh.links[user._id].rights & 8) != 0)) { // "Remote Control permission"

                                        // Get this device
                                        var agent = parent.wsagents[node._id];
                                        if (agent != null) {
                                            // Send the power command
                                            try { agent.send(JSON.stringify({ action: 'poweraction', actiontype: command.actiontype })); } catch (ex) { }
                                            powerActions++;
                                        }
                                    }
                                }
                            });
                        }
                        // Confirm we may be doing something (TODO)
                        try { ws.send(JSON.stringify({ action: 'poweraction' })); } catch (ex) { }
                    }
                    break;
                }
            case 'toast':
                {
                    if (common.validateArray(command.nodeids, 1) == false) break; // Check nodeid's
                    if (common.validateString(command.title, 1, 512) == false) break; // Check title
                    if (common.validateString(command.msg, 1, 4096) == false) break; // Check message
                    for (i in command.nodeids) {
                        nodeid = command.nodeids[i];
                        var powerActions = 0;
                        if (common.validateString(nodeid, 1, 1024) == false) break; // Check nodeid
                        if ((nodeid.split('/').length == 3) && (nodeid.split('/')[1] == domain.id)) { // Validate the domain, operation only valid for current domain
                            // Get the device
                            db.Get(nodeid, function (err, nodes) {
                                if (nodes.length != 1) return;
                                var node = nodes[0];

                                // Get the mesh for this device
                                mesh = parent.meshes[node.meshid];
                                if (mesh) {

                                    // Check if this user has rights to do this
                                    if (mesh.links[user._id] != null && ((mesh.links[user._id].rights & 8) != 0)) { // "Remote Control permission"

                                        // Get this device
                                        var agent = parent.wsagents[node._id];
                                        if (agent != null) {
                                            // Send the power command
                                            try { agent.send(JSON.stringify({ action: 'toast', title: command.title, msg: command.msg })); } catch (ex) { }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    break;
                }
            case 'getnetworkinfo':
                {
                    // Argument validation
                    if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                    if ((command.nodeid.split('/').length != 3) || (command.nodeid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                    // Get the device
                    db.Get(command.nodeid, function (err, nodes) {
                        if (nodes.length != 1) { try { ws.send(JSON.stringify({ action: 'getnetworkinfo', nodeid: command.nodeid, netif: null })); } catch (ex) { } return; }
                        var node = nodes[0];

                        // Get the mesh for this device
                        mesh = parent.meshes[node.meshid];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if (mesh.links[user._id] == null || (mesh.links[user._id].rights == 0)) { try { ws.send(JSON.stringify({ action: 'getnetworkinfo', nodeid: command.nodeid, netif: null })); } catch (ex) { } return; }

                            // Get network information about this node
                            db.Get('if' + command.nodeid, function (err, netinfos) {
                                if (netinfos.length != 1) { try { ws.send(JSON.stringify({ action: 'getnetworkinfo', nodeid: command.nodeid, netif: null })); } catch (ex) { } return; }
                                var netinfo = netinfos[0];
                                try { ws.send(JSON.stringify({ action: 'getnetworkinfo', nodeid: command.nodeid, updateTime: netinfo.updateTime, netif: netinfo.netif })); } catch (ex) { }
                            });
                        }
                    });
                    break;
                }
            case 'changedevice':
                {
                    // Argument validation
                    if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                    if ((command.nodeid.split('/').length != 3) || (command.nodeid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain
                    if ((command.userloc) && (command.userloc.length != 2) && (command.userloc.length != 0)) return;

                    // Change the device
                    db.Get(command.nodeid, function (err, nodes) {
                        if (nodes.length != 1) return;
                        var node = nodes[0];

                        // Get the mesh for this device
                        mesh = parent.meshes[node.meshid];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 4) == 0)) return;

                            // Ready the node change event
                            var changes = [], event = { etype: 'node', username: user.name, action: 'changenode', nodeid: node._id, domain: domain.id };
                            change = 0;
                            event.msg = ": ";

                            // If we are in WAN-only mode, host is not used
                            if ((args.wanonly == true) && (command.host)) { delete command.host; }

                            // Look for a change
                            if (command.icon && (command.icon != node.icon)) { change = 1; node.icon = command.icon; changes.push('icon'); }
                            if (command.name && (command.name != node.name)) { change = 1; node.name = command.name; changes.push('name'); }
                            if (command.host && (command.host != node.host)) { change = 1; node.host = command.host; changes.push('host'); }
                            if (domain.geolocation && command.userloc && ((node.userloc == null) || (command.userloc[0] != node.userloc[0]) || (command.userloc[1] != node.userloc[1]))) {
                                change = 1;
                                if ((command.userloc.length == 0) && (node.userloc)) {
                                    delete node.userloc;
                                    changes.push('location removed');
                                } else {
                                    command.userloc.push((Math.floor((new Date()) / 1000)));
                                    node.userloc = command.userloc.join(',');
                                    changes.push('location');
                                }
                            }
                            if (command.desc != null && (command.desc != node.desc)) { change = 1; node.desc = command.desc; changes.push('description'); }
                            if (command.intelamt != null) {
                                if ((command.intelamt.user != null) && (command.intelamt.pass != undefined) && ((command.intelamt.user != node.intelamt.user) || (command.intelamt.pass != node.intelamt.pass))) { change = 1; node.intelamt.user = command.intelamt.user; node.intelamt.pass = command.intelamt.pass; changes.push('Intel AMT credentials'); }
                                if (command.intelamt.tls && (command.intelamt.tls != node.intelamt.tls)) { change = 1; node.intelamt.tls = command.intelamt.tls; changes.push('Intel AMT TLS'); }
                            }
                            if (command.tags) { // Node grouping tag, this is a array of strings that can't be empty and can't contain a comma
                                var ok = true;
                                if (common.validateString(command.tags, 0, 4096) == true) { command.tags = command.tags.split(','); }
                                if (common.validateStrArray(command.tags, 1, 256) == true) { var groupTags = command.tags; for (var i in groupTags) { groupTags[i] = groupTags[i].trim(); if ((groupTags[i] == '') || (groupTags[i].indexOf(',') >= 0)) { ok = false; } } }
                                if (ok == true) { groupTags.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); }); node.tags = groupTags; change = 1; }
                            } else if ((command.tags === '') && node.tags) { delete node.tags; change = 1; }

                            if (change == 1) {
                                // Save the node
                                db.Set(node);

                                // Event the node change
                                event.msg = 'Changed device ' + node.name + ' from group ' + mesh.name + ': ' + changes.join(', ');
                                var node2 = common.Clone(node);
                                if (node2.intelamt && node2.intelamt.pass) delete node2.intelamt.pass; // Remove the Intel AMT password before eventing this.
                                event.node = node2;
                                parent.parent.DispatchEvent(['*', node.meshid], obj, event);
                            }
                        }
                    });
                    break;
                }
            case 'uploadagentcore':
                {
                    if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                    if (common.validateString(command.type, 1, 40) == false) break; // Check path

                    // Change the device
                    db.Get(command.nodeid, function (err, nodes) {
                        if (nodes.length != 1) return;
                        var node = nodes[0];

                        // Get the mesh for this device
                        mesh = parent.meshes[node.meshid];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if (mesh.links[user._id] == null || (((mesh.links[user._id].rights & 16) == 0) && (user.siteadmin != 0xFFFFFFFF))) { return; }

                            if (command.type == 'default') {
                                // Send the default core to the agent
                                parent.parent.updateMeshCore(function () { parent.sendMeshAgentCore(user, domain, command.nodeid, 'default'); });
                            } else if (command.type == 'clear') {
                                // Clear the mesh agent core on the mesh agent
                                parent.sendMeshAgentCore(user, domain, command.nodeid, 'clear');
                            } else if (command.type == 'recovery') {
                                // Send the recovery core to the agent
                                parent.sendMeshAgentCore(user, domain, command.nodeid, 'recovery');
                            } else if ((command.type == 'custom') && (common.validateString(command.path, 1, 2048) == true)) {
                                // Send a mesh agent core to the mesh agent
                                var file = parent.getServerFilePath(user, domain, command.path);
                                if (file != null) {
                                    fs.readFile(file.fullpath, 'utf8', function (err, data) {
                                        if (err != null) {
                                            data = common.IntToStr(0) + data; // Add the 4 bytes encoding type & flags (Set to 0 for raw)
                                            parent.sendMeshAgentCore(user, domain, command.nodeid, 'custom', data);
                                        }
                                    });
                                }
                            }
                        }
                    });
                    break;
                }
            case 'agentdisconnect':
                {
                    if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                    if (common.validateInt(command.disconnectMode) == false) return; // Check disconnect mode

                    // Change the device
                    db.Get(command.nodeid, function (err, nodes) {
                        if (nodes.length != 1) return;
                        var node = nodes[0];

                        // Get the mesh for this device
                        mesh = parent.meshes[node.meshid];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if (mesh.links[user._id] == null || (((mesh.links[user._id].rights & 16) == 0) && (user.siteadmin != 0xFFFFFFFF))) return;

                            // Force mesh agent disconnection
                            parent.forceMeshAgentDisconnect(user, domain, command.nodeid, command.disconnectMode);
                        }
                    });
                    break;
                }
            case 'close':
                {
                    // Close the web socket session
                    if (obj.req.session && obj.req.session.ws && obj.req.session.ws == ws) { delete obj.req.session.ws; }
                    try { ws.close(); } catch (e) { }
                    break;
                }
            case 'getcookie':
                {
                    // Check if this user has rights on this nodeid
                    if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                    db.Get(command.nodeid, function (err, nodes) { // TODO: Make a NodeRights(user) method that also does not do a db call if agent is connected (???)
                        if (nodes.length == 1) {
                            meshlinks = user.links[nodes[0].meshid];
                            if ((meshlinks) && (meshlinks.rights) && (meshlinks.rights & parent.MESHRIGHT_REMOTECONTROL != 0)) {
                                // Add a user authentication cookie to a url
                                var cookieContent = { userid: user._id, domainid: user.domain };
                                if (command.nodeid) { cookieContent.nodeid = command.nodeid; }
                                if (command.tcpaddr) { cookieContent.tcpaddr = command.tcpaddr; } // Indicates the browser want to agent to TCP connect to a remote address
                                if (command.tcpport) { cookieContent.tcpport = command.tcpport; } // Indicates the browser want to agent to TCP connect to a remote port
                                command.cookie = parent.parent.encodeCookie(cookieContent);
                                try { ws.send(JSON.stringify(command)); } catch (ex) { }
                            }
                        }
                    });
                    break;
                }
            case 'inviteAgent':
                {
                    if ((parent.parent.mailserver == null) || (args.lanonly == true)) return; // This operation requires the email server
                    if ((parent.parent.certificates.CommonName == null) || (parent.parent.certificates.CommonName.indexOf('.') == -1)) return; // Server name must be configured
                    if (common.validateString(command.meshid, 1, 1024) == false) break; // Check meshid
                    if ((command.meshid.split('/').length != 3) || (command.meshid.split('/')[1] != domain.id)) return; // Invalid domain, operation only valid for current domain

                    // Get the mesh
                    mesh = parent.meshes[command.meshid];
                    if (mesh) {
                        if (mesh.mtype != 2) return; // This operation is only allowed for mesh type 2, agent mesh

                        // Check if this user has rights to do this
                        //if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 4) == 0)) return;

                        // Perform email invitation
                        parent.parent.mailserver.sendAgentInviteMail(domain, user.name, command.email, command.meshid, command.name, command.os, command.msg, command.flags);
                    }
                    break;
                }
            case 'setNotes':
                {
                    // Argument validation
                    if (common.validateString(command.id, 1, 1024) == false) break; // Check id
                    var splitid = command.id.split('/');
                    if ((splitid.length != 3) || (splitid[1] != domain.id)) return; // Invalid domain, operation only valid for current domain
                    var idtype = splitid[0];
                    if ((idtype != 'user') && (idtype != 'mesh') && (idtype != 'node')) return;

                    if (idtype == 'node') {
                        // Check if this user has rights on this id to set notes
                        db.Get(command.id, function (err, nodes) { // TODO: Make a NodeRights(user) method that also does not do a db call if agent is connected (???)
                            if (nodes.length == 1) {
                                meshlinks = user.links[nodes[0].meshid];
                                if ((meshlinks) && (meshlinks.rights) && (meshlinks.rights & parent.MESHRIGHT_SETNOTES != 0)) {
                                    // Set the id's notes
                                    if (common.validateString(command.notes, 1) == false) {
                                        db.Remove('nt' + command.id); // Delete the note for this node
                                    } else {
                                        db.Set({ _id: 'nt' + command.id, type: 'note', value: command.notes }); // Set the note for this node
                                    }
                                }
                            }
                        });
                    } else if (idtype == 'mesh') {
                        // Get the mesh for this device
                        mesh = parent.meshes[command.id];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if ((mesh.links[user._id] == null) || ((mesh.links[user._id].rights & 1) == 0)) { return; } // Must have rights to edit the mesh

                            // Set the id's notes
                            if (common.validateString(command.notes, 1) == false) {
                                db.Remove('nt' + command.id); // Delete the note for this node
                            } else {
                                db.Set({ _id: 'nt' + command.id, type: 'note', value: command.notes }); // Set the note for this mesh
                            }
                        }
                    } else if ((idtype == 'user') && ((user.siteadmin & 2) != 0)) {
                        // Set the id's notes
                        if (common.validateString(command.notes, 1) == false) {
                            db.Remove('nt' + command.id); // Delete the note for this node
                        } else {
                            db.Set({ _id: 'nt' + command.id, type: 'note', value: command.notes }); // Set the note for this user
                        }
                    }

                    break;
                }
            case 'otpauth-request':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported) {
                        // Request a one time password to be setup
                        var otplib = null;
                        try { otplib = require('otplib'); } catch (ex) { }
                        if (otplib == null) { break; }
                        const secret = otplib.authenticator.generateSecret(); // TODO: Check the random source of this value.
                        ws.send(JSON.stringify({ action: 'otpauth-request', secret: secret, url: otplib.authenticator.keyuri(user.name, parent.certificates.CommonName, secret) }));
                    }
                    break;
                }
            case 'otpauth-setup':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported) {
                        // Perform the one time password setup
                        var otplib = null;
                        try { otplib = require('otplib'); } catch (ex) { }
                        if (otplib == null) { break; }
                        otplib.authenticator.options = { window: 2 }; // Set +/- 1 minute window
                        if (otplib.authenticator.check(command.token, command.secret) === true) {
                            // Token is valid, activate 2-step login on this account.
                            user.otpsecret = command.secret;
                            parent.db.SetUser(user);
                            ws.send(JSON.stringify({ action: 'otpauth-setup', success: true })); // Report success

                            // Notify change
                            parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Added authentication application.', domain: domain.id });
                        } else {
                            ws.send(JSON.stringify({ action: 'otpauth-setup', success: false })); // Report fail
                        }
                    }
                    break;
                }
            case 'otpauth-clear':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported) {
                        // Clear the one time password secret
                        if (user.otpsecret) {
                            delete user.otpsecret;
                            parent.db.SetUser(user);
                            ws.send(JSON.stringify({ action: 'otpauth-clear', success: true })); // Report success

                            // Notify change
                            parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Removed authentication application.', domain: domain.id });
                        } else {
                            ws.send(JSON.stringify({ action: 'otpauth-clear', success: false })); // Report fail
                        }
                    }
                    break;
                }
            case 'otpauth-getpasswords':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported == false) break;

                    // Perform a sub-action
                    var actionTaken = false;
                    if (command.subaction == 1) { // Generate a new set of tokens
                        var randomNumbers = [], v;
                        for (var i = 0; i < 10; i++) { do { v = getRandomEightDigitInteger(); } while (randomNumbers.indexOf(v) >= 0); randomNumbers.push(v); }
                        user.otpkeys = { keys: [] };
                        for (var i = 0; i < 10; i++) { user.otpkeys.keys[i] = { p: randomNumbers[i], u: true } }
                        actionTaken = true;
                    } else if (command.subaction == 2) { // Clear all tokens
                        actionTaken = (user.otpkeys != null);
                        user.otpkeys = null;
                    }

                    // Save the changed user
                    if (actionTaken) { parent.db.SetUser(user); }

                    // Return one time passwords for this user
                    if (user.otpsecret || ((user.otphkeys != null) && (user.otphkeys.length > 0))) {
                        ws.send(JSON.stringify({ action: 'otpauth-getpasswords', passwords: user.otpkeys ? user.otpkeys.keys : null }));
                    }

                    // Notify change
                    parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Added security key.', domain: domain.id });
                    break;
                }
            case 'otp-hkey-get':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported == false) break;

                    // Send back the list of keys we have, just send the list of names and index
                    var hkeys = [];
                    if (user.otphkeys != null) { for (var i = 0; i < user.otphkeys.length; i++) { hkeys.push({ i: user.otphkeys[i].keyIndex, name: user.otphkeys[i].name, type: user.otphkeys[i].type }); } }

                    ws.send(JSON.stringify({ action: 'otp-hkey-get', keys: hkeys }));
                    break;
                }
            case 'otp-hkey-remove':
                {
                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if (twoStepLoginSupported == false || command.index == null) break;

                    // Remove a key
                    var foundAtIndex = -1;
                    if (user.otphkeys != null) { for (var i = 0; i < user.otphkeys.length; i++) { if (user.otphkeys[i].keyIndex == command.index) { foundAtIndex = i; } } }
                    if (foundAtIndex != -1) {
                        user.otphkeys.splice(foundAtIndex, 1);
                        parent.db.SetUser(user);
                    }

                    // Notify change
                    parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Removed security key.', domain: domain.id });
                    break;
                }
            case 'otp-hkey-yubikey-add':
                {
                    if (parent.parent.config.settings.no2factorauth === true) return;

                    // Yubico API id and signature key can be requested from https://upgrade.yubico.com/getapikey/
                    var yubikeyotp = null;
                    try { yubikeyotp = require('yubikeyotp'); } catch (ex) { }

                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if ((yubikeyotp == null) || (twoStepLoginSupported == false) || (typeof command.otp != 'string')) {
                        ws.send(JSON.stringify({ action: 'otp-hkey-yubikey-add', result: false, name: command.name }));
                        break;
                    }

                    // Check if Yubikey support is present or OTP no exactly 44 in length
                    if ((typeof domain.yubikey != 'object') || (typeof domain.yubikey.id != 'string') || (typeof domain.yubikey.secret != 'string') || (command.otp.length != 44)) {
                        ws.send(JSON.stringify({ action: 'otp-hkey-yubikey-add', result: false, name: command.name }));
                        break;
                    }

                    // TODO: Check if command.otp is modhex encoded, reject if not.

                    // Query the YubiKey server to validate the OTP
                    var request = { otp: command.otp, id: domain.yubikey.id, key: domain.yubikey.secret, timestamp: true }
                    if (domain.yubikey.proxy) { request.requestParams = { proxy: domain.yubikey.proxy }; }
                    yubikeyotp.verifyOTP(request, function (err, results) {
                        if ((results != null) && (results.status == 'OK')) {
                            var keyIndex = parent.crypto.randomBytes(4).readUInt32BE(0);
                            var keyId = command.otp.substring(0, 12);
                            if (user.otphkeys == null) { user.otphkeys = []; }

                            // Check if this key was already registered, if so, remove it.
                            var foundAtIndex = -1;
                            for (var i = 0; i < user.otphkeys.length; i++) { if (user.otphkeys[i].keyid == keyId) { foundAtIndex = i; } }
                            if (foundAtIndex != -1) { user.otphkeys.splice(foundAtIndex, 1); }

                            // Add the new key and notify
                            user.otphkeys.push({ name: command.name, type: 2, keyid: keyId, keyIndex: keyIndex });
                            parent.db.SetUser(user);
                            ws.send(JSON.stringify({ action: 'otp-hkey-yubikey-add', result: true, name: command.name, index: keyIndex }));

                            // Notify change TODO: Should be done on all sessions/servers for this user.
                            parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Added security key.', domain: domain.id });
                        } else {
                            ws.send(JSON.stringify({ action: 'otp-hkey-yubikey-add', result: false, name: command.name }));
                        }
                    });

                    break;
                }
            case 'otp-hkey-setup-request':
                {
                    if (parent.parent.config.settings.no2factorauth === true) return;

                    var authdoglib = null;
                    try { authdoglib = require('authdog'); } catch (ex) { }

                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if ((authdoglib == null) || (twoStepLoginSupported == false)) break;

                    // Build list of known keys
                    var knownKeys = [];
                    if (user.otphkeys != null) { for (var i = 0; i < user.otphkeys.length; i++) { if (user.otphkeys[i].type == 1) { knownKeys.push(user.otphkeys[i]); } } }

                    // Build a key registration request and send it over
                    authdoglib.startRegistration('https://' + parent.parent.certificates.CommonName, knownKeys, { requestId: 556, timeoutSeconds: 100 }).then(function (registrationRequest) {
                        // Save registration request to session for later use
                        obj.hardwareKeyRegistrationRequest = registrationRequest;

                        // Send registration request to client
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-request', request: registrationRequest, name: command.name }));
                    }, function (error) {
                        // Handle registration request error
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-request', request: null, error: error, name: command.name }));
                    });
                    break;
                }
            case 'otp-hkey-setup-response':
                {
                    if (parent.parent.config.settings.no2factorauth === true) return;

                    var authdoglib = null;
                    try { authdoglib = require('authdog'); } catch (ex) { }

                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if ((authdoglib == null) || (twoStepLoginSupported == false) || (command.response == null) || (command.name == null) || (obj.hardwareKeyRegistrationRequest == null)) break;

                    // Check the key registration request
                    authdoglib.finishRegistration(obj.hardwareKeyRegistrationRequest, command.response).then(function (registrationStatus) {
                        var keyIndex = parent.crypto.randomBytes(4).readUInt32BE(0);
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-response', result: true, name: command.name, index: keyIndex }));
                        if (user.otphkeys == null) { user.otphkeys = []; }
                        user.otphkeys.push({ name: command.name, type: 1, publicKey: registrationStatus.publicKey, keyHandle: registrationStatus.keyHandle, certificate: registrationStatus.certificate, keyIndex: keyIndex });
                        parent.db.SetUser(user);
                        delete obj.hardwareKeyRegistrationRequest;

                        // Notify change
                        parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Added security key.', domain: domain.id });
                    }, function (error) {
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-response', result: false, error: error, name: command.name, index: keyIndex }));
                        delete obj.hardwareKeyRegistrationRequest;
                    });
                    break;
                }
            case 'webauthn-startregister':
                {
                    if (parent.parent.config.settings.no2factorauth === true) return;

                    // Check is 2-step login is supported
                    const twoStepLoginSupported = ((domain.auth != 'sspi') && (parent.parent.certificates.CommonName.indexOf('.') != -1) && (args.lanonly !== true) && (args.nousers !== true));
                    if ((twoStepLoginSupported == false) || (command.name == null) || (parent.f2l == null)) break;

                    parent.f2l.attestationOptions().then(function (registrationOptions) {
                        // Convert the challenge to base64 and add user information
                        registrationOptions.challenge = Buffer(registrationOptions.challenge).toString('base64');
                        registrationOptions.user.id = Buffer(user._id, 'binary').toString('base64');
                        registrationOptions.user.name = user._id;
                        registrationOptions.user.displayName = user._id.split('/')[2];

                        // Send the registration request
                        obj.webAuthnReqistrationRequest = { action: 'webauthn-startregister', keyname: command.name, request: registrationOptions };
                        ws.send(JSON.stringify(obj.webAuthnReqistrationRequest));
                        //console.log(obj.webAuthnReqistrationRequest);
                    }, function (error) {
                        console.log('webauthn-startregister-error', error);
                    });
                    break;
                }
            case 'webauthn-endregister':
                {
                    if (parent.parent.config.settings.no2factorauth === true) return;
                    if ((obj.webAuthnReqistrationRequest == null) || (parent.f2l == null)) return;

                    // Figure out the origin
                    var httpport = ((args.aliasport != null) ? args.aliasport : args.port);
                    var origin = "https://" + (domain.dns ? domain.dns : parent.certificates.CommonName);
                    if (httpport != 443) { origin += ':' + httpport; }

                    var attestationExpectations = {
                        challenge: obj.webAuthnReqistrationRequest.request.challenge.split('+').join('-').split('/').join('_').split('=').join(''), // Convert to Base64URL
                        origin: origin,
                        factor: "either"
                    };

                    var clientAttestationResponse = command.response;
                    clientAttestationResponse.id = clientAttestationResponse.rawId;
                    clientAttestationResponse.rawId = new Uint8Array(Buffer.from(clientAttestationResponse.rawId, 'base64')).buffer;
                    clientAttestationResponse.response.attestationObject = new Uint8Array(Buffer.from(clientAttestationResponse.response.attestationObject, 'base64')).buffer;
                    clientAttestationResponse.response.clientDataJSON = new Uint8Array(Buffer.from(clientAttestationResponse.response.clientDataJSON, 'base64')).buffer;

                    parent.f2l.attestationResult(clientAttestationResponse, attestationExpectations).then(function (regResult) {
                        // Since we are registering a WebAuthn/FIDO2 key, remove all U2F keys (Type 1).
                        var otphkeys2 = [];
                        for (var i = 0; i < user.otphkeys.length; i++) { if (user.otphkeys[i].type != 1) { otphkeys2.push(user.otphkeys[i]); } }
                        user.otphkeys = otphkeys2;

                        // Add the new WebAuthn/FIDO2 keys
                        var keyIndex = parent.crypto.randomBytes(4).readUInt32BE(0);
                        if (user.otphkeys == null) { user.otphkeys = []; }
                        user.otphkeys.push({ name: obj.webAuthnReqistrationRequest.keyname, type: 3, publicKey: regResult.authnrData.get('credentialPublicKeyPem'), counter: regResult.authnrData.get('counter'), keyIndex: keyIndex, keyId: clientAttestationResponse.id });
                        parent.db.SetUser(user);
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-response', result: true, name: command.name, index: keyIndex }));

                        // Notify change
                        parent.parent.DispatchEvent(['*', 'server-users', user._id], obj, { etype: 'user', username: user.name, account: parent.CloneSafeUser(user), action: 'accountchange', msg: 'Added security key.', domain: domain.id });
                    }, function (error) {
                        console.log('webauthn-endregister-error', error);
                        ws.send(JSON.stringify({ action: 'otp-hkey-setup-response', result: false, error: error, name: command.name, index: keyIndex }));
                    });

                    delete obj.hardwareKeyRegistrationRequest;
                    break;
                }
            case 'getClip': {
                if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid

                // Get the device
                db.Get(command.nodeid, function (err, nodes) {
                    if (nodes.length != 1) return;
                    var node = nodes[0];

                    // Get the mesh for this device
                    mesh = parent.meshes[node.meshid];
                    if (mesh) {
                        // Check if this user has "remote" rights to do this
                        if ((mesh.links[user._id] == null) || ((mesh.links[user._id].rights & 16) == 0)) return;

                        // Ask for clipboard data from agent
                        var agent = parent.wsagents[node._id];
                        if (agent != null) { try { agent.send(JSON.stringify({ action: 'getClip' })); } catch (ex) { } }
                    }
                });
                break;
            }
            case 'setClip': {
                if (common.validateString(command.nodeid, 1, 1024) == false) break; // Check nodeid
                if (common.validateString(command.data, 1, 65535) == false) break; // Check 

                // Get the device
                db.Get(command.nodeid, function (err, nodes) {
                    if (nodes.length != 1) return;
                    var node = nodes[0];

                    // Get the mesh for this device
                    mesh = parent.meshes[node.meshid];
                    if (mesh) {
                        // Check if this user has "remote" rights to do this
                        if ((mesh.links[user._id] == null) || ((mesh.links[user._id].rights & 16) == 0)) return;

                        // Send clipboard data to the agent
                        var agent = parent.wsagents[node._id];
                        if (agent != null) { try { agent.send(JSON.stringify({ action: 'setClip', data: command.data })); } catch (ex) { } }
                    }
                });
                break;
            }
            case 'getNotes':
                {
                    // Argument validation
                    if (common.validateString(command.id, 1, 1024) == false) break; // Check id
                    var splitid = command.id.split('/');
                    if ((splitid.length != 3) || (splitid[1] != domain.id)) return; // Invalid domain, operation only valid for current domain
                    var idtype = splitid[0];
                    if ((idtype != 'user') && (idtype != 'mesh') && (idtype != 'node')) return;

                    if (idtype == 'node') {
                        // Get the device
                        db.Get(command.id, function (err, nodes) {
                            if (nodes.length != 1) return;
                            var node = nodes[0];

                            // Get the mesh for this device
                            mesh = parent.meshes[node.meshid];
                            if (mesh) {
                                // Check if this user has rights to do this
                                if (mesh.links[user._id] == null || (mesh.links[user._id].rights == 0)) { return; }

                                // Get the notes about this node
                                db.Get('nt' + command.id, function (err, notes) {
                                    try {
                                        if (notes.length != 1) { ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: null })); return; }
                                        ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: notes[0].value }));
                                    } catch (ex) { }
                                });
                            }
                        });
                    } else if (idtype == 'mesh') {
                        // Get the mesh for this device
                        mesh = parent.meshes[command.id];
                        if (mesh) {
                            // Check if this user has rights to do this
                            if (mesh.links[user._id] == null || ((mesh.links[user._id].rights & 1) == 0)) { return; } // Must have rights to edit the mesh

                            // Get the notes about this node
                            db.Get('nt' + command.id, function (err, notes) {
                                try {
                                    if (notes.length != 1) { ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: null })); return; }
                                    ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: notes[0].value }));
                                } catch (ex) { }
                            });
                        }
                    } else if ((idtype == 'user') && ((user.siteadmin & 2) != 0)) {
                        // Get the notes about this node
                        db.Get('nt' + command.id, function (err, notes) {
                            try {
                                if (notes.length != 1) { ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: null })); return; }
                                ws.send(JSON.stringify({ action: 'getNotes', id: command.id, notes: notes[0].value }));
                            } catch (ex) { }
                        });
                    }

                    break;
                }
            default: {
                // Unknown user action
                console.log('Unknown action from user ' + user.name + ': ' + command.action + '.');
                break;
            }
        }
    }

    // Display a notification message for this session only.
    function displayNotificationMessage(msg, tag) { ws.send(JSON.stringify({ "action": "msg", "type": "notify", "value": msg, "userid": user._id, "username": user.name, "tag": tag })); }

    // Read the folder and all sub-folders and serialize that into json.
    function readFilesRec(path) {
        var r = {}, dir = fs.readdirSync(path);
        for (var i in dir) {
            var f = { t: 3, d: 111 };
            var stat = fs.statSync(path + '/' + dir[i]);
            if ((stat.mode & 0x004000) == 0) { f.s = stat.size; f.d = stat.mtime.getTime(); } else { f.t = 2; f.f = readFilesRec(path + '/' + dir[i]); }
            r[dir[i]] = f;
        }
        return r;
    }

    // Delete a directory with a files and directories within it
    // TODO, make this an async function
    function deleteFolderRecursive(path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file, index) {
                var curPath = parent.path.join(path, file);;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    };

    function updateUserFiles(user, ws, domain) {
        if ((user == null) || (user.siteadmin == null) || ((user.siteadmin & 8) == 0)) return;

        // Request the list of server files
        var files = { action: 'files', filetree: { n: 'Root', f: {} } };

        // Add user files
        files.filetree.f[user._id] = { t: 1, n: 'My Files', f: {} };
        files.filetree.f[user._id].maxbytes = parent.getQuota(user._id, domain);
        var usersplit = user._id.split('/'), domainx = 'domain';
        if (usersplit[1].length > 0) domainx = 'domain-' + usersplit[1];

        // Read all files recursively
        try {
            files.filetree.f[user._id].f = readFilesRec(parent.path.join(parent.filespath, domainx + "/user-" + usersplit[2]));
        } catch (e) {
            // TODO: We may want to fake this file structure until it's needed.
            // Got an error, try to create all the folders and try again...
            try { fs.mkdirSync(parent.filespath); } catch (e) { }
            try { fs.mkdirSync(parent.path.join(parent.filespath, domainx)); } catch (e) { }
            try { fs.mkdirSync(parent.path.join(parent.filespath, domainx + "/user-" + usersplit[2])); } catch (e) { }
            try { fs.mkdirSync(parent.path.join(parent.filespath, domainx + "/user-" + usersplit[2] + "/Public")); } catch (e) { }
            try { files.filetree.f[user._id].f = readFilesRec(parent.path.join(parent.filespath, domainx + "/user-" + usersplit[2])); } catch (e) { }
        }

        // Add files for each mesh
        for (var i in user.links) {
            if ((user.links[i].rights & 32) != 0) { // Check that we have file permissions
                var mesh = parent.meshes[i];
                if (mesh) {
                    var meshsplit = mesh._id.split('/');
                    files.filetree.f[mesh._id] = { t: 4, n: mesh.name, f: {} };
                    files.filetree.f[mesh._id].maxbytes = parent.getQuota(mesh._id, domain);

                    // Read all files recursively
                    try {
                        files.filetree.f[mesh._id].f = readFilesRec(parent.path.join(parent.filespath, domainx + "/mesh-" + meshsplit[2]));
                    } catch (e) {
                        files.filetree.f[mesh._id].f = {}; // Got an error, return empty folder. We will create the folder only when needed.
                    }
                }
            }
        }

        // Respond
        try { ws.send(JSON.stringify(files)); } catch (ex) { }
    }

    function EscapeHtml(x) { if (typeof x == "string") return x.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); if (typeof x == "boolean") return x; if (typeof x == "number") return x; }
    //function EscapeHtmlBreaks(x) { if (typeof x == "string") return x.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '<br />').replace(/\n/g, '').replace(/\t/g, '&nbsp;&nbsp;'); if (typeof x == "boolean") return x; if (typeof x == "number") return x; }

    // Split a string taking into account the quoats. Used for command line parsing
    function splitArgs(str) { var myArray = [], myRegexp = /[^\s"]+|"([^"]*)"/gi; do { var match = myRegexp.exec(str); if (match != null) { myArray.push(match[1] ? match[1] : match[0]); } } while (match != null); return myArray; }
    function toNumberIfNumber(x) { if ((typeof x == 'string') && (+parseInt(x) === x)) { x = parseInt(x); } return x; }

    function removeAllUnderScore(obj) {
        if (typeof obj != 'object') return obj;
        for (var i in obj) { if (i.startsWith('_')) { delete obj[i]; } else if (typeof obj[i] == 'object') { removeAllUnderScore(obj[i]); } }
        return obj;
    }

    // Generate a 8 digit integer with even random probability for each value.
    function getRandomEightDigitInteger() {
        var bigInt;
        do { bigInt = parent.crypto.randomBytes(4).readUInt32BE(0); } while (bigInt >= 4200000000);
        return bigInt % 100000000;
    }

    // Parse arguments string array into an object
    function parseArgs(argv) {
        var results = { '_': [] }, current = null;
        for (var i = 1, len = argv.length; i < len; i++) {
            var x = argv[i];
            if (x.length > 2 && x[0] == '-' && x[1] == '-') {
                if (current != null) { results[current] = true; }
                current = x.substring(2);
            } else {
                if (current != null) { results[current] = toNumberIfNumber(x); current = null; } else { results['_'].push(toNumberIfNumber(x)); }
            }
        }
        if (current != null) { results[current] = true; }
        return results;
    }

    return obj;
};