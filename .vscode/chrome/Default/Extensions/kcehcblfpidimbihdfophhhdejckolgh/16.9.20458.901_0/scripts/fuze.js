/* global $, chrome, console */
Fuze = (function(){
    "use strict";
    var _authCallback = function(){ };
    var _authInProcess = false;
    var _fuzeDomain = "https://www.fuzemeeting.com";
    var _client = {
        id: "ce9ea1ad89e4433d91be7018ac091505",
        secret: "68248e1b839d49839945a48ef820a3f2"
    };

    var _fuze = {
        dateFormat:function(value, callback) {
            if ( typeof(value) == "function" ) {
                var temp = callback;
                callback = value;
                value = temp;
            }

            if ( value ) {
                chrome.storage.local.set({dateFormat: value}, function(){
                    chrome.storage.local.get("dateFormat", callback);
                });
            }
            else {
                chrome.storage.local.get("dateFormat", callback);
            }
        },
        domain:function(value, callback) {
            if ( typeof(value) == "function" ) {
                var temp = callback;
                callback = value;
                value = temp;
            }

            if ( value ) {
                _fuzeDomain = value;
                chrome.storage.local.set({fuze_domain:value}, function(){
                    if ( callback && typeof(callback) == "function" ) {
                        callback(_fuzeDomain);
                    }
                });
            }
            else {
                chrome.storage.local.get("fuze_domain", function(items){
                    if ( items.fuze_domain ) {
                        _fuzeDomain = items.fuze_domain;
                    }

                    if ( callback && typeof(callback) == "function" ) {
                        callback(_fuzeDomain);
                    }
                });
            }
        },
        serialize:function(obj) {
            var qstr = "";
            if ( window.$ && window.$.param ) {
                qstr = $.param(obj);
            }
            else {
                for(var p in obj) {
                    if ( p.match(/invitations/i) ) {
                        var invitations = obj[p];
                        for (var i = 0; i < invitations.length; i++)
                        {
                            if ( qstr ) {
                                qstr += "&";
                            }

                            var invitation = invitations[i];
                            var index = i + 1;
                            var key = "meeting.invitations-" + index;
                            qstr += key + ".name=" + encodeURIComponent(invitation.name) + "&";
                            qstr += key + ".email=" + encodeURIComponent(invitation.email);
                        }

                        continue;
                    }

                    if ( qstr ) {
                        qstr += "&";
                    }

                    var val = obj[p].toString();
                    if ( p.match(/subject|invitationMessageBody/i) ) {
                        val = encodeURIComponent(val);
                    }

                    qstr += p + "=" + val;
                }
            }

            return qstr;
        },
        validateAccessToken:function(access_token, callback) {
            console.log('Validate Access Token: ' + access_token);
            _fuze.domain(function(domain){
                var type = "POST";
                var url = domain + "/oauth2/check";
                var async = true;
                var r = new XMLHttpRequest();
                r.open(type, url, async);
                r.setRequestHeader("Authorization", "bearer " + _fuze.base64(access_token));
                r.onreadystatechange = function () {
                    if ( r.readyState == 4 ) {
                        if ( r.status == 200 ) {
                            callback({ok: true, token: access_token});
                        }
                        else if ( r.status == 401 ){
                            console.error('Token request error 401: ' + access_token);
                            chrome.storage.local.remove(["access_token", "expires_in"], function(){
                                callback({ok: false});
                            });
                        }
                        else {
                            console.error('Token request error ' + r.status + ': ' + access_token);
                            callback({ok: false});
                        }
                    }
                };
                r.send();
            });
        },
        refreshToken:function(refresh_token, user_id, callback) {
            console.log('Refresh Token for user ' + user_id + ': ' + refresh_token);
            _fuze.domain(function(domain){
                var type = "POST";
                var url = domain + "/oauth2/token";
                var async = true;
                var data = encodeURI(_fuze.serialize({
                    grant_type: "refresh_token",
                    refresh_token: refresh_token,
                    user_id: user_id
                }));

                var ahdr = _fuze.base64(_client.id + ":" + _client.secret);
                var r = new XMLHttpRequest();
                r.open(type, url, async);
                r.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                r.setRequestHeader("Authorization", "basic " + ahdr);
                r.onreadystatechange = function () {
                    if ( r.readyState == 4 ) {
                        if ( r.status == 200 ) {
                            var access_token_info = JSON.parse(r.responseText);
                            chrome.storage.local.set(access_token_info,  function(){
                                callback({ok: true});
                            });
                        }
                        else {
                            callback({ok: false, status: r.status});
                            console.error('Refresh Token error ' + r.status + ': ' + refresh_token);
                        }
                    }
                };
                r.send(data);
            });
        },
        auth:function(callback, confirmPopUpFirst, confirmationMessage) {
            _authCallback = callback;
            chrome.storage.local.get("access_token", function(items){
                if ( items.access_token ) {
                    _fuze.validateAccessToken(items.access_token, function(status){
                        if ( status.ok ) {
                            callback({ok: true, token: items.access_token});
                        }
                        else {
                            chrome.storage.local.get(["refresh_token", "user_id"], function(items){
                                _fuze.refreshToken(items.refresh_token, items.user_id, function(refreshed){
                                    if (refreshed.ok) {
                                        _fuze.auth(callback, confirmPopUpFirst, confirmationMessage);
                                    }
                                    else if (refreshed.status === 401) {
                                        chrome.storage.local.remove(["refresh_token", "access_token", "user_id", "expires_in"], function(items){
                                            if ( !confirmPopUpFirst || _fuze.confirmPopUp(confirmationMessage) ) {
                                                _fuze.showSignInPopUp();
                                            }
                                            else {
                                                _authInProcess = false;
                                            }
                                        });
                                    }
                                    else {
                                        callback({ok: false});
                                        _authInProcess = false;
                                    }
                                });
                            });
                        }
                    });
                }
                else if ( !confirmPopUpFirst || _fuze.confirmPopUp(confirmationMessage) ) {
                    _fuze.showSignInPopUp();
                }
                else {
                    _authInProcess = false;
                }
            });
        },
        confirmPopUp:function(msg){
            return confirm(msg || "In order to sync this meeting with Fuze, you will need to sign in first.\nSign in now?");
        },
        getMeetingParams:function(action, meeting) {
            var params ={};
            if ( action === "get" ) {
                params = {
                    conferenceId: meeting.id
                };
            }
            else if ( action === "create") {
                params = {
                    // We force the default meeting type to be open
                    "meeting.mode": "O",
                    "meeting.createdVia": "googlecal",
                    "meeting.subject": meeting.subject,
                    "meeting.startTime": meeting.startTime,
                    "meeting.endTime": meeting.endTime,
                    "meeting.displayTollFree": false,
                    "meeting.displayInternationalDial": true,
                    "meeting.autoRecording": false,
                    "meeting.viewExpiryTime": "",
                    "meeting.invitationMessageBody": meeting.invitationMessageBody,
                    "invitations": meeting.invitations,
                    "sendEmail": 0
                };
            }
            else if (action === "update") {
                params = {
                    "meeting.mode": meeting.type ? meeting.type.toUpperCase() : "O",
                    "meeting.id": meeting.id,
                    "meeting.createdVia": "googlecal",
                    "meeting.subject": meeting.subject,
                    "meeting.startTime": meeting.startTime,
                    "meeting.endTime": meeting.endTime,
                    "meeting.displayTollFree": false,
                    "meeting.displayInternationalDial": true,
                    "meeting.autoRecording": false,
                    "meeting.viewExpiryTime": "",
                    "meeting.invitationMessageBody": meeting.invitationMessageBody,
                    "meeting.externalId": meeting.external_id,
                    "invitations": meeting.invitations,
                    "sendEmail": 0
                };
            }
            else if (action === "delete") {
              params = {
                    "conferenceId": meeting.id,
                    "sendEmail": 0
                };
            }

            return params;
        },
        callServer:function(type, action, meeting, callback, confirmPopUpFirst, confirmationMessage) {
            if ( !_authInProcess ) {
                _fuze.domain(function(domain){
                    _authInProcess = true;
                    _fuze.auth(function(authResponse){
                        _authInProcess = false;
                        if (authResponse.ok) {
                            var data = _fuze.getMeetingParams(action, meeting);
                            data.extension_version = chrome.runtime.getManifest().version;
                            var url = domain + "/services/meeting/" + action + "Meeting";
                            var async = true;
                            var r = new XMLHttpRequest();
                            r.open(type, url, async);
                            r.setRequestHeader("Authorization", "bearer " + _fuze.base64(authResponse.token));
                            r.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                            r.onreadystatechange = function () {
                                if ( r.readyState == 4 && r.status == 200) {
                                    var response = JSON.parse(r.responseText);
                                    response.ok = (response.code == 200);
                                    callback(response);
                                }
                            };
                            r.send(_fuze.serialize(data));
                        }
                        else {
                            callback(authResponse);
                        }
                    }, confirmPopUpFirst, confirmationMessage);
                });
            }

        },
        base64:function(str) {
            return window.btoa(unescape(encodeURIComponent(str)));
        },
        showSignInPopUp:function() {
            if ( !window.popupId ) {
                _fuze.domain(function(domain){
                    var url = domain + "/oauth2/token?client_id=" + _client.id + "&ext_acct=" + Fuze.Account;
                    var ahdr = _fuze.base64(_client.id + ":" + _client.secret);
                    chrome.windows.create({
                        url: url,
                        type: "popup",
                        height: 560,
                        width: 500,
                        top: 200,
                        left: 400
                    }, function(win){
                        window.popupId = win.id;
                        chrome.tabs.onUpdated.addListener(function(tabId,changeInfo,tab){
                            if (changeInfo.status === "complete" && tab.url.indexOf("/oauth2/token") > -1){// &&
                                chrome.tabs.executeScript(tabId, {
                                    code: "" +
                                        "$('#ajax-panel').on('DOMSubtreeModified', function(e){ " +
                                            "if (!window.handled){ window.handled=true; chrome.runtime.sendMessage({\"action\": \"handleAuthResponse\", \"data\": this.innerHTML, \"tabid\": " + tabId + "})}" +
                                        "});" +
                                        "if ($('#ajax-panel').html().length > 0){$('#ajax-panel').trigger('DOMSubtreeModified');}" +
                                        "$('#ahdr').val('" + ahdr + "');",
                                    runAt: "document_end"
                                });
                            }
                        });
                        chrome.windows.onRemoved.addListener(function(windowId) {
                            if ( windowId == window.popupId ) {
                                window.popupId = undefined;
                                _authInProcess = false;
                                _fuze.handleAuthResponse({ok: false});
                            }
                        });
                    });
                });
            }
        },
        logout:function(callback) {
          _fuze.domain(function(domain){
            var type = "GET";
            var url = domain + "/logout";
            var async = true;
            var ahdr = _fuze.base64(_client.id + ":" + _client.secret);
            var r = new XMLHttpRequest();
            r.open(type, url, async);
            r.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            r.setRequestHeader("Authorization", "basic " + ahdr);
            r.onreadystatechange = callback();
            r.send();
          });
        },
        handleAuthResponse:function(response) {
            if ( window.popupId ) {
                chrome.windows.remove(window.popupId);
                window.popupId = undefined;
            }

            var responseToUI = response;
            if (typeof(responseToUI) == "string") {
                responseToUI = JSON.parse(responseToUI);
                if (typeof(responseToUI) == "string") {
                    responseToUI = JSON.parse(responseToUI);
                }
            }

            if ( responseToUI.ok === false) {
                _authCallback({ok: false});
            }
            else {
                chrome.storage.local.set(responseToUI, function(){
                    chrome.storage.local.get("access_token", function(items){
                        _authCallback({ok:true, token:items.access_token});
                    });
                });
            }
        },
        getLocaleFormat:function() {
            var lds = new Date(2013, 9, 25).toLocaleDateString();
            var yPosi = lds.search("2013");
            var dPosi = lds.search("25");
            var mPosi = lds.search("10");
            if(mPosi == -1){
                mPosi = lds.search("9");
                if(mPosi == -1){
                    if(yPosi !== 0 && dPosi !== 0){
                        //if the year and day are not first then maybe month is first
                        mPosi = 0;
                    }
                    else if((yPosi+4 <  lds.length) && (dPosi+2 < lds.length)){
                        //if year and day are not last then maybe month is last
                        mPosi = Infinity;
                    }
                    else  if(yPosi < dPosi){
                        //otherwise is in the middle
                        mPosi = ((dPosi - yPosi)/2) + yPosi;
                    }
                    else if(dPosi < yPosi){
                        mPosi = ((yPosi - dPosi)/2) + dPosi;
                    }
                }
            }

            var formatString="";
            var order = [yPosi, dPosi, mPosi];
            order.sort(function(a,b){return a-b;});
            for(var i=0; i < order.length; i++){
                if(order[i] == yPosi){
                    formatString += "yyyy";
                }
                else if(order[i] == dPosi){
                    formatString += "dd";
                }
                else if(order[i] == mPosi){
                    formatString += "mm";
                }
            }

            return formatString.substring(0, formatString.length-1);
        }
    };

    return {
        Domain: function(value, callback) { return _fuze.domain(value, callback); },
        CallServer:function(type, action, meeting, callback, confirmPopUpFirst, confirmationMessage) { return _fuze.callServer(type, action, meeting, callback, confirmPopUpFirst, confirmationMessage); },
        HandleAuthResponse: function(response){ return _fuze.handleAuthResponse(response); },
        DateFormat: function(value, callback) { _fuze.dateFormat(value, callback); },
        Logout: function(callback) { return _fuze.logout(callback); },
        Login: function(callback) { return _fuze.auth(callback); }
    };
})();