/* 
 * worker do not have access to window object. However, mesibo uses window for plenty of call 
 * related apis and hence we need to delegate
 *
 * To debug and view logs, chrome://inspect/#workers
 */
var ports = []; // we need to maintain an array so that callbacks can be invoked for each port
var active_port = null;
var mesibo_api_init = true;
var mesibo_last_status = -1;

console.log("........SHARED WORKER EXEC.........", new Date());


onconnect = function(event) {
	var port = event.ports[0];

	console.log("shared onconnect: ", ports, ports.length);
	ports.push(port);
	port.start();

	port.addEventListener("message", function(event) { 
		message_handler(event, port); 
	} );
	

	// every time a tab connects, send connection status
	if(mesibo_last_status >= 0) {
		var p = {op: "Mesibo_OnConnectionStatus", status: mesibo_last_status, value: 0 };
		send_to_port(port, null, p);
	}
}

// pass null to op for sending object as it is
send_to_port = function(port, op, obj) {
	if(op) obj = { op: op, data: obj };
	port.postMessage(obj);
}

send_to_all = function(op, obj) {
	if(op) obj = { op: op, data: obj };
	for(i = 0; i < ports.length; i++) {
		ports[i].postMessage(obj);
	}
}

send_mesibo_init = function(port) {
	if(mesibo_api_init) {
		mesibo_api_init = false;

		//initialize mesibo
		send_to_port(port, "init", null);
		active_port = port;
	}
}

send_mesibo_read_messages = function(port) {
		// send it to acticve port to read messages 
		send_to_port(port, "read_messages", null);
}

// here we need to handle outgoing messages and call requests
message_handler = function (event, port) {
	console.log("shared message_handler event", event, "from port", port);
	var data = event.data;
	var op = data.op;

	if(op == "private_close") {
		console.log("private_close", "port is closed");

		ports.splice(ports.indexOf(port), 1);

		/* if the active port is closed, reconnect using another port/tab */
		if(port == active_port) {
			mesibo_api_init = true;
			if(ports.length) {								
				console.log("active port closed. Reconnect using another port/tab", ports[0]);
				send_mesibo_init(ports[0]);
			}
		}
	
		return;
	}

	if(op == "start"){		
		send_mesibo_init(port);
	}

	if(op == "private_message") {
		// send it to acticve port to send message 
		send_to_port(active_port, null, data);

		//TBD. inform all the tabs about new message
		send_to_all(null, data);
	}

	if(op == "sendMessage") {
		// send it to active port to send message 
		send_to_port(active_port, null, data);

		// Inform all the tabs about new message
		var p = {};
		p.m = data.params;
		p.data = new TextEncoder().encode(data.message);

		console.log("inform everyone..", p);
		send_to_all("Mesibo_OnMessage", p);
	}

	if(op == "sendFile") {
		var p = {};
		p.m = data.params;
		p.f = data.file;
		// send it to acticve port to send file 
		send_to_port(active_port, "sendFile", p);
		
		var msg = {};
		msg.m = Object.assign(data.params, data.file);
		msg.data = ""; 
		console.log("inform everyone..", msg);
		send_to_all("Mesibo_OnMessage", p);
	}

	if(op == "call"){
		console.log("call: ", port == active_port);
		if(port != active_port) {
			console.log("Switching active port for video call..");
			mesibo_api_init = true;
			send_mesibo_init(port);
		}

		send_to_port(active_port, null, data);
	}

	if(op == "hangup"){
		send_to_all(null, data);
	}

	if(op == "answer"){
		send_to_all(null, data);
	}


	if(op == "readMessages"){
		console.log("mesibo-shared:", "readMessages", data)
		send_to_port(active_port, null, data);
	}

	if(op == "readMessagesResult"){
		console.log("mesibo-shared:", "readMessagesResult", data)
		send_to_all(null, data);
	}

	if(op == "update_message_session"){
		send_to_all(null, data);
	}
	// store last status which we can pass it to new tabs
	if(op == "Mesibo_OnConnectionStatus") {
		mesibo_last_status = data.status;
	}

	if(op.startsWith("Mesibo_On")) {
		send_to_all(null, data);
	}

	//TBD, process
}
