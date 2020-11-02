---
description: Mesibo tutorial for creating a chat popup app 
keywords: chat popup, web, messenger, javascript 
heading: Create a multi-tab chat popup 
title: Create a chat popup app using Mesibo
---

This article will describe the implementation of a web-based chat popup app, having real-time messaging, voice, and video calls that can be opened and viewed simultaneously on multiple-tabs. 

A chat popup like this can be used to build online customer support services, chatbots, feedback forms, etc. You can download and modify the complete source code of the chat popup app from [Github](https://github.com/mesibo/messenger-javscript) 

## Chat Popup Features
The chat popup app has fully functional real-time messaging, voice, and video calling. Some of the key features are

- Multi-tab support
- One-to-One Messaging, Voice and Video Call
- Group Messaging
- Read receipts
- Send Files
- Record and Send live audio from microphone
- Send photos captured live using Webcam
- Chat history
- Link Preview

## Prerequisites
Before we dive into building a multi-tab chat popup, ensure that you've read the following.

- [Get Started Guide]({{ '/documentation/get-started/' | relative_url }}).
- Tutorial on [Writing your First mesibo Enabled Application]({{ '/documentation/tutorials/get-started/first-app/' | relative_url }}).
- [First Javscript App]({{ '/documentation/tutorials/get-started/first-app/js' | relative_url }}).
- Mesibo Sample Web apps: [Sample Js App](https://github.com/mesibo/samples/tree/master/js), [Messenger](https://github.com/mesibo/messenger-javascript)
- For multi-tab support, we will use the concept of [Shared Workers](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker). You can learn about how you can initialize and connect to mesibo on a shared worker, switching between active workers/tabs [here](https://github.com/mesibo/messenger-javascript)


It is expected that you are already familiar with the mesibo Javascript API and you have created basic apps using mesibo API. If you have not, ensure that you read the get-started and first-app tutorial mentioned above and try simple apps before proceeding with this tutorial.

Let's get started.

## Download the source code 
Download the chat popup app source from [Github](https://github.com/mesibo/messenger-javscript) 
```
git clone https://github.com/mesibo/messenger-javscript.git
```

## Configure Mesibo
Edit `mesibo/config.js` and provide the `AUTH TOKEN` & `APP ID`.

Obtain the `AUTH TOKEN` and `APP ID` for a user from [Mesibo Console](https://mesibo.com/console/). You can also generate the token for the Web app from [Mesibo Demo App Token Geneartor](https://app.mesibo.com/gentoken/). Provide `APP ID` as `console`.

See the [Preparation Guide](https://mesibo.com/documentation/tutorials/first-app/#preparation) to learn about creating users 

```javascript
const MESIBO_ACCESS_TOKEN = "xxxxxxx";
const MESIBO_APP_ID = "xxxx";
const MESIBO_API_URL = "https://app.mesibo.com/api.php"
```
If you are hosting mesibo-backend on your server, you need to change the API URL to point to your server.

## Configure Popup
Configure the following for setting the displayed user avatar and destination user(to which all messages will be sent to) in `mesibo/config.js`. 

```javascript
const POPUP_DISPLAY_NAME = "xxxx"
const POPUP_DISPLAY_PICTURE = "images/profile/default-profile-icon.jpg"
const POPUP_DESTINATION_USER = 'xxxx';
```

## Initialize Mesibo
As discussed [here](https://github.com/mesibo/messenger-javascript) the initialization of mesibo API functions and callbacks will be handled by a Web Worker defined in `mesibo-worker.js`.

So, in your app script initialize mesibo as follows:
```javascript
// Instead of directly accessing Mesibo APIs like so,
// $scope.mesibo = new Mesibo();
// use a wrapper API that uses a shared worker                          
let mesibo = new MesiboWorker($scope);
let mesiboNotify = $scope;

//Initialize Mesibo
mesibo.setAppName(MESIBO_APP_ID);
mesibo.setCredentials(MESIBO_ACCESS_TOKEN);
mesibo.setListener($scope);
mesibo.setDatabase("mesibo");
mesibo.start(); 
```

When you call `MesiboWorker.start`, a `start` message is sent to the shared worker
```javascript
//mesibo-worker.js
MesiboWorker.prototype.start = function(){
        var post = {op: "start"};
        this.mesibo_worker.port.postMessage(post);
}
```
On the shared worker end, we will then initialize mesibo
```javascript
//mesibo-shared.js
if(op == "start"){
                send_mesibo_init(port);
        }

send_mesibo_init = function(port) {
        if(mesibo_api_init) {
                mesibo_api_init = false;

                //initialize mesibo
                send_to_port(port, "init", null);
                active_port = port;
        }
}
```
In our shared worker, We will only initialize and connect to mesibo once — when a tab connects for the first time. After that, the tab that connected via that port is set to be **active**. This active mesibo port is used to connect to mesibo, send messages, make calls, etc directly through Mesibo APIs.

```javascript
//mesibo-worker.js

case "init":
	console.log("Received init message from shared worker");
	this._mesibo_init();
	break;
```

### Sending Messages
For example, to send a message you call the `sendMessage` function and a message is posted to the shared worker for a `sendMessage` operation.
```javascript
//mesibo-worker.js
MesiboWorker.prototype.sendMessage = function(p, id, m){
        var post = {op: "sendMessage", id: id, message: m, params: p};
        this.mesibo_worker.port.postMessage(post);
}
```

The shared worker receives this message and forwards the message parameters to the active port. Also, all the other connected tabs will be notified of the message sent through a `Mesibo_OnMessage` callback.

```javascript
//mesibo-shared.js

if(op == "sendMessage") {
        // send it to active port to send message
        send_to_port(active_port, null, data);

        //Inform all the tabs about new message
        var p = {};
        p.m = data.params;
        p.data = new TextEncoder().encode(data.message);

        console.log("inform everyone..", p);
        send_to_all("Mesibo_OnMessage", p);
}
```
Now, only the active port will get the `sendMessage` call and will inturn call Mesibo API function `sendMessage` to the required destination.
```javascript
//mesibo-worker.js

case "sendMessage":
        // send message for this and other tab
        if(this.mesibo_api)
                this.mesibo_api.sendMessage(o.params, o.id, o.message);
        break;

```

### Receiving Messages
Similar to sending messages being handled by the active port, only the active port will receive the messages from Mesibo through the `Mesibo_OnMessage` callback. The active port must forward this to all other connected ports. The active port connected to mesibo, forwards all such data(like `Mesibo_OnConnectionStatus`, `Mesibo_OnMessageStatus`, etc) received through callbacks.

```javascript
//mesibo-worker.js
MesiboNotifyForward.prototype.Mesibo_OnMessage = function(m, data) {
        console.log("Forwarding Mesibo_OnMessage: from "  + m.peer + " id: " + m.id);
        var p = {op: "Mesibo_OnMessage", data:{'m':m, 'data': data} };
        this.worker.port.postMessage(p);
        this.client_notify.Mesibo_OnMessage(m, data);
}
```

Once the shared worker gets this it sends it to all connected ports.
```javascript
//mesibo-shared.js
if(op.startsWith("Mesibo_On")) {
        send_to_all(null, data);
}
```
Similarly, you can define worker functions for sending files, making calls, etc. You also need to [switch the active tab](https://github.com/mesibo/messenger-javscript) when a currently active tab is closed. 


## Launch the Popup 
Open the page `index.html` in your browser. Click on the floating circle in the bottom-right corner to launch the popup window. You can open `index.html` simultaneously in as many tabs as you like

