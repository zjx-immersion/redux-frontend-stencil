chrome.runtime.onStartup.addListener(function(){
	//
	// Fired when a profile that has this extension installed first starts up.
	// This event is not fired when an incognito profile is started,
	// even if this extension is operating in 'split' incognito mode.
	//
});
chrome.runtime.onSuspend.addListener(function(){
	//
	// Sent to the event page just before it is unloaded.
	// This gives the extension opportunity to do some clean up.
	// Note that since the page is unloading, any asynchronous operations started
	// while handling this event are not guaranteed to complete.
	// If more activity for the event page occurs before it gets unloaded the
	// onSuspendCanceled event will be sent and the page won't be unloaded.
	//
	// NOTE: Listen to the runtime.onSuspend event if you need to do last second cleanup
	// 		 before your event page is shut down.
	// 		 However, we recommend persisting periodically instead.
	//		 That way if your extension crashes without receiving onSuspend, no data will typically be lost.
	//
});
chrome.runtime.onSuspendCanceled.addListener(function(){
	//
	// Sent after onSuspend to indicate that the app won't be unloaded after all.
	//
});
chrome.runtime.onUpdateAvailable.addListener(function(details){
	//
	// Fired when an update is available, but isn't installed immediately because the app is currently running.
	// If you do nothing, the update will be installed the next time the background page gets unloaded,
	// if you want it to be installed sooner you can explicitly call chrome.runtime.reload().
	//
	var version = details.version; // The version number of the available update.
});
chrome.runtime.onConnect.addListener(function(port){
	//
	// Fired when a connection is made from either an extension process or a content script.
	//
	var connectedPort = port || {
		name: "string",
		disconnect: function(){},
		postMessage: function(){},
		onDisconnect: {}, // events.Event
		onMessage: {}, // events.Event
		sender: { // This property will only be present on ports passed to onConnect/onConnectExternal listeners.
			tab: "optional tabs.Tab", // The tabs.Tab which opened the connection, if any. This property will only be present when the connection was opened from a tab (including content scripts), and only if the receiver is an extension, not an app.
			id: "optional string", // The ID of the extension or app that opened the connection, if any.
			url: "optional string", // The URL of the page or frame that opened the connection, if any. This property will only be present when the connection was opened from a tab or content script.
			tlsChannelId: "optional string" // The TLS channel ID of the web page that opened the connection, if requested by the extension or app, and if available.
		}
	};
});
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	//
	// Fired when a message is sent from either an extension process or a content script.
	//
	// message: The message sent by the calling script.
	// sender: An MessageSender object containing information about the script context that sent a message or request
	// sendResponse: Function to call (at most once) when you have a response.
	// 		The argument should be any JSON-ifiable object.
	// 		If you have more than one onMessage listener in the same document,
	// 		then only one may send a response. This function becomes invalid when the event listener returns,
	// 		unless you return true from the event listener to indicate you wish to send a response
	// 		asynchronously (this will keep the message channel open to the other end until sendResponse is called).
	switch(message.action) {
		case "setDomain":
			if ( message.data ) {
				Fuze.Domain(message.data, function(domain){
					sendResponse({domain: domain});
				})
			}
			else {
				sendResponse({});
			}
			break;
		case "get":
		case "create":
		case "update":
    case "delete":
			if ( message.account ) {
				Fuze.Account = message.account;
			}

			Fuze.CallServer("POST", message.action, message.data, sendResponse, message.confirmPopUpFirst, message.confirmationMessage)
			break;
		case "handleAuthResponse":
			Fuze.HandleAuthResponse(message.data)
			break;
		case "flashMessage":
			if ( message.redirect_to ) {
				chrome.notifications.create("", message.data, function(optionsId){
					chrome.notifications.onClicked.addListener(function(nid){
						if ( nid == optionsId ) {
							if ( message.redirect_to == "options" ) {
								goToOptions()
							}

							sendResponse();
						}
					})
				})
			}
			else {
				chrome.notifications.create("", message.data, sendResponse)
			}
			break;
		case "clearMessage":
			chrome.notifications.clear(message.data, sendResponse);
			break;
		case "dateFormat":
			Fuze.DateFormat(message.data, sendResponse)
			break;
		case "goToOptions":
			goToOptions()
			break;
		case "optionsError":
			chrome.notifications.create("options_error", {
                type: "basic",
                title: "Options mismatch",
                message: message.data,
                iconUrl: "images/icon48_error.png"
            }, function(optionsErrorId){
                chrome.notifications.onClicked.addListener(function(notificationId){
                	if ( optionsErrorId == notificationId ) {
                		goToOptions();
                		sendResponse();
                	}
                })
            })
			break;
		default:
			console.log("Unknown '" + message.action + "' action received");
			break;
	}

	return true
});
chrome.runtime.onRestartRequired.addListener(function(reason){
	//
	// Fired when an app or the device that it runs on needs to be restarted.
	// The app should close all its windows at its earliest convenient time to let the restart to happen.
	// If the app does nothing, a restart will be enforced after a 24-hour grace period has passed.
	// Currently, this event is only fired for Chrome OS kiosk apps.
	var restartReason = reason; // The reason that the event is being dispatched.
	switch(restartReason) {
		case "app_update":
			// 'app_update' is used when the restart is needed because the application is updated to a newer version.
			break;
		case "os_update":
			// 'os_update' is used when the restart is needed because the browser/OS is updated to a newer version.
			break;
		case "periodic":
			// 'periodic' is used when the system runs for more than the permitted uptime set in the enterprise policy.
			break;
		default:
			break;
	}
});
chrome.runtime.onInstalled.addListener(function(details){
	// Extension installed
	var reason = details.reason; // The reason that this event is being dispatched.
	var previousVersion = "";
	switch(details.reason) {
		case "install":
			chrome.notifications.create("", {
                type: "basic",
                title: "Fuze on Chrome installed!",
                message: "Click here to go to Google Calendar.\nConvert your events into meetings by clicking \"Make it a Fuze Meeting\" on an event details page\n",
                iconUrl: "images/icon48.png"
            }, function(welcomeId){
                chrome.notifications.onClicked.addListener(function(notificationId){
                	if ( welcomeId == notificationId ) {
                		chrome.tabs.create({url:"http://calendar.google.com"}, function(){})
                	}
                })
            })
			break;
		case "update":
			previousVersion = details.previousVersion; // Indicates the previous version of the extension, which has just been updated.
			break;
		case "chrome_update":
			break;
		default:
			break;
	}
});
goToOptions = function() {
	chrome.tabs.create({'url': chrome.extension.getURL("/views/options.html") } )
}