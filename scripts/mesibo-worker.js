function MesiboNotifyForward(cn, w) {
	this.client_notify = cn;
	this.worker = w;
}

MesiboNotifyForward.prototype.Mesibo_OnConnectionStatus = function(status, value) {
	console.log("Forwarding Mesibo_OnConnectionStatus: "  + status);
	var p = {op: "Mesibo_OnConnectionStatus", status: status, value: value };
	this.worker.port.postMessage(p);
	this.client_notify.Mesibo_OnConnectionStatus(status, value);

}

MesiboNotifyForward.prototype.Mesibo_OnMessageStatus = function(m) {
	console.log("Forwarding Mesibo_OnMessageStatus: from "  + m.peer + " status: " + m.status + " id: " + m.id);
	var p = {op: "Mesibo_OnMessageStatus", m: m };
	this.worker.port.postMessage(p);
	this.client_notify.Mesibo_OnMessageStatus(m);
}

MesiboNotifyForward.prototype.Mesibo_OnMessage = function(m, data) {
	console.log("Forwarding Mesibo_OnMessage: from "  + m.peer + " id: " + m.id);
	var p = {op: "Mesibo_OnMessage", data:{'m':m, 'data': data} };
	this.worker.port.postMessage(p);
	this.client_notify.Mesibo_OnMessage(m, data);
}

MesiboNotifyForward.prototype.Mesibo_OnCall = function(callid, from, video) {
	console.log("Forwarding Mesibo_onCall: " + (video?"Video":"Voice") + " call from: " + from);
	var p = {op: "Mesibo_OnCall", callid: callid, from: from, video: video };
	this.worker.port.postMessage(p);
	this.client_notify.Mesibo_OnCall(callid, from, video);
}

MesiboNotifyForward.prototype.Mesibo_OnCallStatus = function(callid, status) {
	console.log("Forwarding Mesibo_onCallStatus: " + status);
	var p = {op: "Mesibo_OnCallStatus", callid: callid, status: status };
	this.worker.port.postMessage(p);
	this.client_notify.Mesibo_OnCallStatus(callid, status);
}

function MesiboWorker(s) {	
	this._init(s);
	return this;
}

MesiboWorker.prototype._init = function(s){
	this.mesibo_api = new Mesibo();
	this.mesibo_appid = "";
	this.mesibo_token = "";
	this.mesibo_db = "";
	this.mesibo_notify = null;
	this.scope = null;	
	this.client_notify = null;
	this.scope = s;


	this.mesibo_read_sessions = [];
	this._createShared();

	this.mesibo_call = {};
}

MesiboWorker.prototype._createShared = function(){
	if(!window.SharedWorker)
		return;

	var worker = new SharedWorker("scripts/mesibo-shared.js");
	var wCtx = this;
	worker.port.addEventListener("message", function(event) {
		wCtx._mesibo_shared_process(event.data);
	}
	, false);
			
	worker.port.start();	

	addEventListener( 'beforeunload', function() {
	    worker.port.postMessage( {op:'private_close'} );
	});

	wCtx.mesibo_worker = worker; 		
}

MesiboWorker.prototype._mesibo_shared_process = function(o) {
	var op = o.op;
	var data = o.data;

	console.log('mesibo_shared_process', o);

	switch(op){

		case "init":
			console.log("Received init message from shared worker");
			this._mesibo_init();			
			break;

		case "sendMessage": 
			// send message for this and other tab
			if(this.mesibo_api)
				this.mesibo_api.sendMessage(o.params, o.id, o.message);
			break;

		case "sendFile": 
			// send message for this and other tab
			if(this.mesibo_api)
				this.mesibo_api.sendFile(data.m, data.m.id, data.f);
			break;

		case "readMessages":			
			if(!this.mesibo_api)
				break;

			MesiboLog("...readMessages...", o);
			var wCtx = this.mesibo_worker;
			var mSession = this.mesibo_api.readDbSession(o.peer, o.groupid, o.ss, 
				function on_messages(m) {
					MesiboLog("readMessages result..", mSession.getMessages(), o);
					wCtx.port.postMessage( 
						{op:'readMessagesResult', data: o, messages:mSession.getMessages(), rid:o.rid});
			});
			mSession.enableReadReceipt(o.read_receipt);
			mSession.read(o.count);  //pass count								
			break;
		
		case "call":
			// make call for this and other tab
			if(this.mesibo_api){
				var cp = o.callParams;
				MesiboLog("call.....", cp);
				if(cp.video){
					MesiboLog("Setup Video Call", cp.src, cp.dest, cp.video);
					var rv = this.mesibo_api.setupVideoCall(cp.src, cp.dest, cp.video);
					MesiboLog("setupVideoCall returned", rv);
				}
				else{
					MesiboLog("Setup Voice Call", cp.src);
					var rv = this.mesibo_api.setupVoiceCall(cp.src);
					MesiboLog("setupVoiceCall returned", rv);
				}
				MesiboLog("call peer.....", cp.peer);
				this.mesibo_api.call(cp.peer);
			}
			break;
		
		case "hangup":
			if(this.mesibo_api){
				this.mesibo_api.hangup(o.h);
			}
			this.scope.hideAnswerModal();
			break;

		case "answer":
			if(this.mesibo_api){
				this.mesibo_api.answer(true);
			}
		
		case "Mesibo_OnConnectionStatus":
			if(this.client_notify)
				this.client_notify.Mesibo_OnConnectionStatus(o.status, o.value);
			break;

		case "Mesibo_OnMessageStatus":
			if(this.client_notify)
				this.client_notify.Mesibo_OnMessageStatus(o.m);
			break;

		case "Mesibo_OnMessage":
			if(this.client_notify){
				MesiboLog("MesiboWorker: Mesibo_OnMessage", data);
				this.client_notify.Mesibo_OnMessage(data.m, data.data);
			}
			break;

		case "Mesibo_OnCall":
			if(this.client_notify){
				MesiboLog("MesiboWorker: Mesibo_OnCall", o);
				this.client_notify.Mesibo_OnCall(o.callid, o.from, o.video);
			}
			break;

		case "Mesibo_OnCallStatus":
			if(this.client_notify){
				MesiboLog("MesiboWorker: Mesibo_OnCallStatus", o);
				this.client_notify.Mesibo_OnMessage(o.callid, o.status);
			}
			break;

		case "readMessagesResult":
			this.OnReadMessages(o.messages, o.data.rid);
		// TBD, implement others
	}
}

MesiboWorker.prototype._mesibo_init = function(){
	try {	
		this.mesibo_api = new Mesibo();
		this.mesibo_notify = new MesiboNotifyForward(this.client_notify, this.mesibo_worker);
		
		MesiboLog("Initializing mesibo..", this,  this.mesibo_appid, this.mesibo_token, this.mesibo_db);

		//Initialize Mesibo
		this.mesibo_api.setAppName(this.mesibo_appid);
		var rv = this.mesibo_api.setCredentials(this.mesibo_token);
		MesiboLog("setCredentials returned", rv);

		var rv = this.mesibo_api.setDatabase(this.mesibo_db);
		MesiboLog("setDatabase returned", rv, this.mesibo_db)
		MesiboLog("mesibo_api", this.mesibo_api);

		this.mesibo_api.setListener(this.mesibo_notify);
					
		this.mesibo_api.start();		 
	}
	catch(e){
		console.log("Exception starting mesibo: ", e);
		this.mesibo_api = null;
	}
}


MesiboWorker.prototype.setAppName = function(appId){
	this.mesibo_appid = appId;
}

MesiboWorker.prototype.setCredentials = function(token){
	this.mesibo_token = token;
}

MesiboWorker.prototype.setListener = function(listener){
	this.client_notify = listener;
}

MesiboWorker.prototype.setDatabase = function(db){
	this.mesibo_db = db;
}

MesiboWorker.prototype.start = function(){
	var post = {op: "start"};
	this.mesibo_worker.port.postMessage(post);
}

MesiboWorker.prototype.sendMessage = function(p, id, m){
	var post = {op: "sendMessage", id: id, message: m, params: p};
	this.mesibo_worker.port.postMessage(post);
}

MesiboWorker.prototype.sendFile = function(p, id, f){
	MesiboLog("MesiboWorker:", "sendFile");
	var post = {op: "sendFile", params:p, id: id, file: f};
	this.mesibo_worker.port.postMessage(post);
}


MesiboWorker.prototype.random = function(){
	return this.mesibo_api.random();
}

MesiboWorker.prototype.getInstance = function(){
	return this.mesibo_api;
}

MesiboWorker.prototype.OnReadMessages = function(m, rid){
	MesiboLog("===OnReadMessages===");
	
	this.scope.update_read_messages(m, rid);

}

MesiboWorker.prototype.readDbSession = function(peer, groupid, ss, on_messages){
	MesiboLog("Worker readDbSession", this.mesibo_api);

	var read_session = {};
	read_session.peer = peer;
	read_session.rid = this.mesibo_read_sessions.length + 1;
	read_session.groupid = groupid;
	read_session.ss = ss;
	read_session.messages = [];
	read_session.on_messages = on_messages;

	read_session.getMessages = function(){
		MesiboLog("read_session", this);
		return this.messages;
	}

	var wCtx = this;

	read_session.enableReadReceipt = function(enable){
		read_session.read_receipt = enable;		
	}
	read_session.read = function(count){
		MesiboLog("MesiboWorker", "read", this);
		var r = this;
		r.count = count;
		var post = {op: "readMessages", peer: r.peer, groupid: r.groupid,
		 ss: r.ss, count: r.count, rid: this.rid, read_receipt: this.read_receipt};
		wCtx.mesibo_worker.port.postMessage(post);
	}

	this.mesibo_read_sessions.push(read_session);	
	return read_session; //**Fix**
}

MesiboWorker.prototype.setupVoiceCall = function(src){
	this.mesibo_call.src = src;
	this.mesibo_call.video = false;	
}

MesiboWorker.prototype.setupVideoCall = function(src, dest, video){
	this.mesibo_call.src = src;
	this.mesibo_call.dest = dest;
	this.mesibo_call.video = true;	
}

MesiboWorker.prototype.call = function(peer){
	this.mesibo_call.peer = peer;
	var post = {op: "call", callParams: this.mesibo_call};
	this.mesibo_worker.port.postMessage(post)
}

MesiboWorker.prototype.hangup = function(h){
	var post = {op: "hangup", h:h};
	this.mesibo_worker.port.postMessage(post);
}

MesiboWorker.prototype.answer = function(a){
	var post = {op: "answer", a:a};
	this.mesibo_worker.port.postMessage(post);
}

	

