/* global $, chrome */
FuzeUI = (function(){
    "use strict";
    var _willReload = false;
    var _fuzeUI = {
        onDOMChange:function() {
            if ( !_fuzeUI.inInitialize ) {
                _fuzeUI.inInitialize = true;
                var locked = false;
                if ( top.location.href.match("^https://(www|calendar).google.com/calendar/") ) {
                    // EDIT AN EVENT VIEW
                    if ( _fuzeUI.eventForm.isCurrentPage() ){
                        _fuzeUI.eventForm.initialize();

                    // CALENDAR VIEW
                    } else {
                      if( _fuzeUI.tooltip.isShowing() ) {
                        if ( !locked ) {
                          locked = true;
                          _fuzeUI.tooltip.attachEvents();
                          locked = false;
                        }
                      }
                    }
                }

                if( _fuzeUI.alert.isShowing() ) {
                    if ( !locked ) {
                        locked = true;
                        _fuzeUI.alert.attachEvents();
                        locked = false;
                    }
                }

                _fuzeUI.inInitialize = undefined;
            }
        },
        sendMessage: function(meeting, callback) {
            try{
                return chrome.runtime.sendMessage(meeting, callback);
            } catch(error) {
                if (!_willReload) {
                    _willReload = true;
                    var confirmAlert = window.confirm("Fuze has been updated. Please reload the page to continue.");
                    if (confirmAlert) {
                        location.reload();
                    }else{
                        _fuzeUI.eventForm.wait(false);
                    }
                }
            }
            return false;
        },
        getURL: function(url) {
            try{
                return chrome.runtime.getURL(url);
            } catch(error) {
                if (!_willReload) {
                    _willReload = true;
                    var confirmAlert = window.confirm("Fuze has been updated. Please reload the page to continue.");
                    if (confirmAlert) {
                        location.reload();
                    }
                }
            }
            return false;
        },
        meeting:{
            create:function(meeting, callback){ return _fuzeUI.sendMessage({action: "create", data: meeting}, callback); },
            update:function(meeting, callback){ return _fuzeUI.sendMessage({action: "update", data: meeting, confirmPopUpFirst: true}, callback); },
            delete:function(meeting, callback){ return _fuzeUI.sendMessage({action: "delete", data: meeting}, callback); },
            get:function(meeting, callback){ return _fuzeUI.sendMessage({action: "get", data: meeting, confirmPopUpFirst:true, confirmationMessage: "In order to get the latest information on your meetings from Fuze, please sign in to Fuze."}, callback); },
            cache:function(meeting){
                if ( meeting ) {
                    _fuzeUI.currentMeetingInstance = meeting;
                }
            },
            validate:function(meeting, action){
                var response = {ok:true};
                if ( isNaN(meeting.id) && action != "create") {
                    response = {
                        ok:false,
                        action:"",
                        data:""
                    };
                }
                else if (!meeting.startTime || !meeting.endTime) {
                    response = {
                        ok:false,
                        action:"",
                        data:""
                    };
                }
                else if ( isNaN(new Date(meeting.startTime).getDate()) || isNaN(new Date(meeting.endTime).getDate()) ) {
                    response = {
                        ok:false,
                        action:"optionsError",
                        data:"Fuze was unable to schedule this meeting. Click here to change your date format preferences."
                    };
                }

                return response;
            }
        },
        settings:{
            extensionName: function(){ return "Fuze on Chrome"; },
            dateFormat:function(callback){
                if ( _fuzeUI.settings.dateFormatString ) {
                    if ( $.isFunction(callback) ) {
                        callback(_fuzeUI.settings.dateFormatString);
                    }
                } else {
                    _fuzeUI.sendMessage({action:"dateFormat"}, function(items){
                        if ( items.dateFormat ) {
                            _fuzeUI.settings.dateFormatString = items.dateFormat;
                        }else {
                            _fuzeUI.settings.dateFormatString = "mm/dd/yyyy";
                        }

                        if ( $.isFunction(callback) ) {
                            callback(_fuzeUI.settings.dateFormatString);
                        }
                    });
                }
            }
        },
        env:{
            active:function(value){
                if ( value !== undefined ) {
                    _fuzeUI.env.attachedEvents = value;
                }

                return _fuzeUI.env.attachedEvents;
            },
            initialize:function(){
                $("input[type=password]").on("keypress", function(e){
                    var value = $(this).val() + String.fromCharCode(e.which);
                    if ( value.length === 12 && value.match(/takemeto/i) ) {
                        var env = value.split("takemeto").pop();
                        if ( env.length === 4 && env.match(/main|intg|pprd|prod/i) ) {
                            var domain = "https://" + env.replace("prod", "www") + ".fuzemeeting.com";
                            _fuzeUI.sendMessage({action: "setDomain", data: domain}, function(response){
                                _fuzeUI.notifications.message(_fuzeUI.settings.extensionName() + " now points to:\n" + response.domain);
                            });
                        }
                    }
                });
            }
        },
        notifications:{
            error:function(action, meeting, message, redirectTo){
                _fuzeUI.sendMessage({
                    action:"flashMessage",
                    redirect_to: redirectTo,
                    data: {
                        type: "basic",
                        title: _fuzeUI.settings.extensionName() + "\nencountered an error",
                        message: "Fuze couldn't #action# your meeting. Please try again... (#message#)".replace(/#action#/g, action).replace(/#message#/g, message),
                        iconUrl: "images/icon48_error.png"
                    }
                }, function(notificationId){
                    // Error displayed to user
                });
            },
            message:function(message, redirectTo){
                _fuzeUI.sendMessage({
                    action:"flashMessage",
                    redirect_to: redirectTo,
                    data: {
                        type: "basic",
                        title: _fuzeUI.settings.extensionName(),
                        message: message,
                        iconUrl: "images/icon48.png"
                    }
                }, function(notificationId){
                    // Message displayed to user
                });
            }
        },

        eventForm:{
            isMeetingHost: false,
            meetingId: 0,
            description: "",
            isCancelable: false, // the meeting is cancelable when GCal has not yet create the event
            isDeleting: false, // we have click on delete
            dividerText:function(){ return "**** Enter your description above + please do not edit the information below ****"; },
            isCurrentPage:function(){ return 2 <= $("[id$=save_top],[id$=cancel_top],[id$=delete_top]").length; },
            buttonsAppended:function(){ return $("[id$=fuze-create],[id$=_fuze_top]").length > 0; },
            isFuzeMeeting:function(){
                var fuzeMeetingLinkFound = false;
                var table = $("table.ep-dp-dt");
                if ( table.length ) {
                    var location = $(".ep-dp-input .textinput").val() || table.find(".ep-dp-input[id$=location]").text();
                    var description = table.find(".ep-dp-descript[id$=descript]").text();
                    fuzeMeetingLinkFound = (_fuzeUI.common.matchMeetingUrl(location) || _fuzeUI.common.matchMeetingUrl(description));
                }
                return fuzeMeetingLinkFound;
            },
            getMeetingId:function(){
              if (!_fuzeUI.eventForm.meetingId) {
                var currentLocation = $(".ep-dp-input .textinput").val() || $(".ep-dp-input[id$=location]").text();
                var meetingLink = _fuzeUI.common.matchMeetingUrl(currentLocation);
                if (meetingLink) {
                    var id = meetingLink.split("/").pop();
                    if ( id && !isNaN(id) ){
                        _fuzeUI.eventForm.meetingId = id;
                    }
                }
              }
              return _fuzeUI.eventForm.meetingId;
            },
            setMeetingFromServer:function(callback){
                var meetingId = _fuzeUI.eventForm.getMeetingId();
                if ( meetingId ) {
                    // Protect the actions before to know if we are the host
                    $(".ep").find(".goog-imageless-button").addClass("wait").attr("disabled", "disabled");
                    _fuzeUI.meeting.get({id:meetingId}, function(response){
                        // Remove protection on the actions
                        $(".ep").find(".goog-imageless-button").removeClass("wait").removeAttr("disabled");
                        if ( response && response.ok && response.meeting ) {
                            _fuzeUI.meeting.cache(response.meeting);
                            _fuzeUI.eventForm.isMeetingHost = response.editPermissions.length > 0;
                            if ( $(".ep-dp-input .textinput").val() && _fuzeUI.eventForm.isMeetingHost && response.meeting.details && response.meeting.details.mode  ) {
                                _fuzeUI.eventForm.setMeetingType(response.meeting.details.mode);
                            }
                        }

                        if ( $.isFunction(callback)) {
                            callback(response && response.ok ? response.meeting : undefined);
                        }
                    });
                }
                else if ( $.isFunction(callback)) {
                    callback();
                }
            },
            initialize:function(){
                _fuzeUI.settings.dateFormat();
                var description = $("table.ep-dp-dt tr[id$='descript-row']:not(.fuze)");
                var running = false;
                var loading = false;
                if ( description.length > 0 ) {
                    description.on("DOMSubtreeModified", function(e){
                        if ( !running ) {
                            if ( _fuzeUI.eventForm.isFuzeMeeting() ) {
                                running = true;

                                if ( !_fuzeUI.buttons.eventFormButtons.isShowing() ) {
                                    _fuzeUI.buttons.eventFormButtons.inject();
                                }

                                if (!loading && !_fuzeUI.currentMeetingInstance) {
                                    loading = true;
                                    _fuzeUI.eventForm.setMeetingFromServer(function(meeting) {
                                        _fuzeUI.buttons.launchFuzeMeeting.inject();
                                    });
                                }

                                _fuzeUI.buttons.launchFuzeMeeting.inject();
                            }
                            else if ( !_fuzeUI.eventForm.buttonsAppended() ) {
                                // We reset the form on new meeting
                                _fuzeUI.currentMeetingInstance = false;
                                _fuzeUI.eventForm.meetingId = 0;
                                _fuzeUI.eventForm.isCancelable = false;
                                _fuzeUI.eventForm.isDeleting = false;
                                _fuzeUI.eventForm.isMeetingHost = false;
                                _fuzeUI.eventForm.isMeetingLoaded = false;
                                running = true;

                                _fuzeUI.buttons.eventFormCreate.inject();
                            }

                            running = false;
                        }
                    }).addClass("fuze");
                }
            },
            getMeetingObject:function(){
                var start = $("[id$='edr-start']");
                var end = $("[id$='edr-end']");
                var timezone = $(".edr-txt:contains(\(GMT)").text();
                // Type is only set when the "select" is visible
                var type = $("tr[id$='fuze-type-row'] td.ep-dp-dt-td select:visible option:selected");
                var description = $(".ep-dp-details textarea").val() || "";
                var dividerIdx = description ? description.indexOf(_fuzeUI.eventForm.dividerText()) : -1;
                if (dividerIdx != -1) {
                    description = description.slice(0, dividerIdx).trim();
                }
                var meeting = {
                   subject : $('.ui-sch input').val(),
                   startTime : _fuzeUI.convert.eventDetailsDateStringToUTCString(start.find("input:first").val(), start.find("input:last").val(), timezone),
                   endTime: _fuzeUI.convert.eventDetailsDateStringToUTCString(end.find("input:last").val(), end.find("input:first").val(), timezone),
                   invitations: _fuzeUI.eventForm.getInvitations(),
                   invitationMessageBody: $(".ep-dp-details textarea").val() || ''
                };
                if (type && type.val()) {
                    meeting.type = type.val();
                }

                var eventId = $(".ep[data-eid]").attr("data-eid");
                if ( eventId ) {
                    meeting.external_id = eventId;
                }

                var meetingId = _fuzeUI.eventForm.getMeetingId();
                if ( meetingId ) {
                    meeting.id = meetingId;
                }

                return meeting;
            },
            setMeetingInForm:function(meeting){
                var createButton = $("span[id$='fuze-create']");
                if ( createButton.is(":visible") ) {
                    $("tr[id$='fuze-link-row']").hide();
                    $("tr[id$='fuze-meeting-row']").show();
                }

                var newDescription;
                if (meeting && meeting.details && meeting.details.renderedInvitation){
                    newDescription = meeting.details.renderedInvitation.replace(/-{66}/, "\n" + _fuzeUI.eventForm.dividerText() + "\n");
                }
                if (newDescription){
                    var table = $("table.ep-dp-dt");
                    var editableDescription = table.find("textarea");
                    var currentDescription = editableDescription.val();
                    if (currentDescription != newDescription ) {
                        _fuzeUI.eventForm.insertTextValue(".ep-dp-descript .textinput", newDescription);
                    }
                }

                var newMeetingLink;
                if (meeting && meeting.details && meeting.details.url){
                    newMeetingLink = meeting.details.url;
                }
                if (newMeetingLink){
                    var currentLocation = $(".ep-dp-input .textinput").val();
                    var currentMeetingLink = _fuzeUI.common.matchMeetingUrl(currentLocation);
                    if ( currentMeetingLink != newMeetingLink ) {
                        if ( currentMeetingLink ) {
                            currentLocation = currentLocation.replace(" + " + currentMeetingLink, "").replace(currentMeetingLink, "");
                        }

                        if ( currentLocation ) {
                            currentLocation += " + ";
                        }

                        _fuzeUI.eventForm.insertTextValue(".ep-dp-input .textinput", currentLocation + newMeetingLink);
                    }
                }

                if ( meeting.details && meeting.details.mode ) {
                    _fuzeUI.eventForm.setMeetingType(meeting.details.mode);
                }

                $("[id$=save_top_fuze]").select().focus();
            },
            wait:function(on){
                var waitClass = "wait";
                var form = $(".ep");
                var controls = form.find(".goog-imageless-button,.lk,.lk-button,input,textarea").removeClass(waitClass).removeAttr("disabled");
                if ( on ) {
                    controls.addClass(waitClass).attr("disabled", "disabled");
                }
            },
            insertTextValue:function(selector, value) {
                // Copy meeting link in the clipboard
                var copyFrom = $("<textarea>").text(value);
                $("body").append(copyFrom);
                copyFrom.select();
                document.execCommand("copy");

                var textInput = $(selector);
                if ( textInput.length ) {
                    textInput = textInput[0];
                    textInput.focus();
                    textInput.value = "";
                    document.execCommand("inserthtml", false, value);
                }
            },
            getInvitations:function() {
                var invitations = [];
                var guests = $("div.ep-gl-guest");
                for (var i = 0; i < guests.length; i++)
                {
                    var invitation = {
                        email: guests[i].id.substring(3),
                        name: guests[i].title
                    };
                    invitations.push(invitation);
                }

                return invitations;
            },
            setMeetingType:function(meetingType){
                var select = $("tr[id$='fuze-type-row'] td.ep-dp-dt-td select");
                if ( select.length && meetingType ) {
                    select.val(meetingType);
                    $("tr[id$='fuze-type-row']").fadeIn(200);
                }
            }
        },
        tooltip:{
            isShowing:function(){ return $(".bubble:visible").length > 0; },
            // TODO REMOVE: Dirty fix to handle old GCal
            isCreateButtonAppended:function(){ return $(".bubble div[class$=create-fuze-meeting]").length > 0 || $(".bubble span[id$=create-fuze-meeting]").length > 0; },
            isMeetingButtonsAppended:function(){ return $(".bubble [id$=fuze-launch-meeting]").length > 0; },
            // TODO REMOVE: Dirty fix to handle old GCal
            isFuzeMeeting:function(){ return _fuzeUI.common.matchMeetingUrl($(".bubble .neb-data").html()).length > 0 || _fuzeUI.common.matchMeetingUrl($(".bubble table.eb-data tr:first td").text()).length > 0; },
            getMeetingId: function() {
                var where = $(".bubble .neb-data");
                var fuzeLink = _fuzeUI.common.matchMeetingUrl(where.html());

                // TODO REMOVE: Dirty fix to handle old GCal
                if (!fuzeLink) {
                    where = $(".bubble").find("table.eb-data");
                    fuzeLink = _fuzeUI.common.matchMeetingUrl(where.html());
                }

                if (fuzeLink) {
                    var id = fuzeLink.split("/").pop();
                    if ( id && !isNaN(id) ){
                        _fuzeUI.eventForm.meetingId = id;
                    }
                }
                return _fuzeUI.eventForm.meetingId;
            },
            attachEvents:function(){
                if (_fuzeUI.tooltip.isShowing() && !_fuzeUI.tooltip.alreadyAttachedEvents ) {
                    if (!_fuzeUI.tooltip.isMeetingButtonsAppended() && _fuzeUI.tooltip.isFuzeMeeting()) {
                        // We reset the form on new meeting
                        _fuzeUI.eventForm.meetingId = _fuzeUI.tooltip.getMeetingId();
                        _fuzeUI.eventForm.isCancelable = false;
                        _fuzeUI.eventForm.isDeleting = false;
                        _fuzeUI.eventForm.isMeetingHost = false;

                        _fuzeUI.tooltip.alreadyAttachedEvents = true;
                        _fuzeUI.buttons.tooltipLaunch.inject();
                        _fuzeUI.buttons.tooltipDelete.inject();
                    }
                    else if (!_fuzeUI.tooltip.isCreateButtonAppended()) {
                        _fuzeUI.tooltip.alreadyAttachedEvents = true;
                        _fuzeUI.buttons.tooltipCreate.inject();
                        _fuzeUI.buttons.tooltipCreate.attachEvents();
                    }
                }
                else {
                    _fuzeUI.tooltip.alreadyAttachedEvents = undefined;
                    setTimeout(_fuzeUI.tooltip.attachEvents, 200);
                }
            }
        },
        alert:{
            alreadyAttachedEvents: false,
            isShowing:function(){ return $(".cal-dialog").length > 0; },
            attachEvents:function(){
                /*setTimeout(function(){
                    // CANCEL THE EVENT (on edition view)
                    if ( _fuzeUI.alert.isShowing() && _fuzeUI.eventForm.isCancelable ) {
                        if ( !_fuzeUI.alert.alreadyAttachedEvents ) {
                            _fuzeUI.alert.alreadyAttachedEvents = true;
                            _fuzeUI.buttons.alertDiscard.inject();
                        }

                    // DELETE WITH GUESTS
                    } else if ( _fuzeUI.alert.isShowing() && _fuzeUI.eventForm.isDeleting ) {
                        if ( !_fuzeUI.alert.alreadyAttachedEvents ) {
                            _fuzeUI.alert.alreadyAttachedEvents = true;
                            _fuzeUI.buttons.alertInvitees.inject();
                        }

                    } else {
                        _fuzeUI.alert.alreadyAttachedEvents = false;
                    }
                }, 0);*/
            }
        },
        common:{
            matchMeetingUrl:function(text) {
                var meetingUrl = "";
                if ( text ) {
                    text = decodeURI(encodeURI(text).replace(/%e2%80%8b/ig, "")); // Unicode nothing
                    var links = text.match(/(http:\/\/|https:\/\/)?((main|intg|pprd|www|fuzebox)\.*)?(fuzemeeting\.com\/fuze|fuze\.me)(\/)([a-zA-Z0-9\/#?=&]*)/img);
                    if (links && links.length) {
                        meetingUrl = _fuzeUI.common.stripUnicodeChars(links[0]);
                        if ( !meetingUrl.match(/https:\/\/|http:\/\//i) ) {
                            meetingUrl = "https://" + meetingUrl;
                        }
                    }
                }

                return meetingUrl;
            },
            stripUnicodeChars:function(s) {
                return s.replace(/[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]*/g, "");
            },
            getURLParamsObject:function(url){
                var params = {};
                url = url.split("?").shift();
                url.split("&").map(function(pair){
                    var kv = pair.split("=");
                    params[kv.shift()] = kv.shift();
                });

                return params;
            },
            getURLParamValue:function(url, name){
                return _fuzeUI.common.getURLParamsObject(url)[name];
            }
        },
        convert:{
            eventDetailsDateStringToUTCString:function(date, time, timezone){
                var utcString = "";
                if (date && time) {
                    var dateFormat = _fuzeUI.settings.dateFormatString;
                    try{
                        var datas = $('#calmaster').html().match(/_Dispatch\((.*?)\);/);
                        var values = [];
                        if (datas && datas.length > 0) {
                            // OLD VERSION : TO BE REMOVED ONCE THE GOOGLE DEPLOY IS COMPLETE
                            datas = datas[1];
                            values = JSON.parse(datas.replace(/\'/g, '"'));
                        }else{
                            datas = $('#calmaster').html().match(/window\[\'INITIAL_DATA\'\] = ([^;]*)\;/)[1];
                            var userInfo = JSON.parse(datas)[2][0][0];
                            values = JSON.parse(userInfo.replace(/\'/g, '"'));
                        }

                        $.each(values[1], function(i, values){
                            if (values[0] === 'dtFldOrdr') {
                                if (values[1] == 'DMY') {
                                    dateFormat = "dd/mm/yyyy";
                                }else if (values[1] == 'MDY') {
                                    dateFormat = "mm/dd/yyyy";
                                }else{
                                    dateFormat = "yyyy-dd-mm";
                                }
                                return;
                            }
                        });
                    }catch(e) {
                        dateFormat = _fuzeUI.settings.dateFormatString;
                    }

                    var delim = (dateFormat.match(/-/) ? "-" : "/");
                    var dbits = date.split(delim);
                    var ampm = (time.match(/am|pm/i) || [""]).pop();
                    var tbits = time.replace(/am|pm/i,"").split(":");
                    var tzone = timezone ? (/\((.*?)\)/i.exec(timezone) || [""]).pop().replace(/:/i,"") : "";
                    if (ampm == "pm" && tbits[0] != "12"){
                        tbits[0] = parseInt(tbits[0])+12;
                    }

                    var dateBits = [];
                    if ( dateFormat == "mm/dd/yyyy" ) {
                        dateBits = [dbits[2],dbits[0],dbits[1]];
                    }
                    else if ( dateFormat == "dd/mm/yyyy" ) {
                        dateBits = [dbits[2],dbits[1],dbits[0]];
                    }
                    else {
                        dateBits = dbits;
                    }

                    var dateTimeString = [dateBits.join("-"), tbits.join(":"), tzone].join(" ").trim();
                    utcString = new Date(Date.parse(dateTimeString)).toUTCString();
                }

                return utcString;
            }
        },
        buttons:{
            native:{
                click:function(googleButton){
                    googleButton = $(googleButton);
                    if ( googleButton && googleButton.length ) {
                        googleButton.find(".goog-imageless-button").addClass("goog-imageless-button-hover goog-imageless-button-focused goog-imageless-button-active").click();
                    }
                }
            },

            // DELETE BUTTON ON ALERT "Do you want to update your guests that you're canceling?"
            alertInvitees:{
                inject: function() {
                    /*var alert = $(".cal-dialog");
                    var countButtons = alert.find(".cal-dialog-buttons button");
                    if (countButtons.length == 3) {
                        var buttonsToMap = ["yes", "no"];
                        $.each(buttonsToMap, function(i, id){
                            var originalButton = alert.find("[name=" + id + "]");
                            if ( originalButton.length ) {
                                originalButton.on("click", _fuzeUI.buttons.alertInvitees.buttonClicked);
                            }
                        });
                    }*/
                },
                buttonClicked: function() {
                    /*var alert = $(".cal-dialog");
                    var btnId = $(this).attr("name").replace(/_fuze/i, "");
                    var meeting = _fuzeUI.eventForm.meetingId;
                    if (meeting && meeting.id) { // EDIT AN EVENT VIEW
                        _fuzeUI.meeting.delete(meeting);
                    }else{ // CALENDAR VIEW
                        var meetingId = _fuzeUI.eventForm.meetingId;
                        if ( meetingId ){
                            _fuzeUI.meeting.get({id:meetingId}, function(response){
                                if ( response && response.ok && response.editPermissions && response.editPermissions.length > 0 ) {
                                    _fuzeUI.meeting.delete({id:meetingId});
                                }
                            });
                        }
                    }*/
                },
            },

            // DISCARD BUTTON ON ALERT "Your event has not been saved."
            alertDiscard:{
              inject: function() {
                /*var alert = $(".cal-dialog");
                var firstButton = alert.find(".cal-dialog-buttons button[name=yes]");
                var countButtons = alert.find(".cal-dialog-buttons button");
                if (countButtons.length == 2 && firstButton.length > 0 && _fuzeUI.eventForm.isMeetingHost && _fuzeUI.eventForm.isCancelable) {
                    var btn = firstButton.hide().clone();
                    btn.attr("id", "discard_fuze");
                    btn.on("click", _fuzeUI.buttons.alertDiscard.buttonClicked);
                    firstButton.after(btn);
                    btn.show();
                }*/
              },
              buttonClicked: function() {
                /*var alert = $(".cal-dialog");
                var meeting = _fuzeUI.eventForm.getMeetingObject();
                if ( meeting && meeting.id && _fuzeUI.eventForm.isCancelable ){
                    _fuzeUI.meeting.delete(meeting);
                }
                var btn = alert.find(".cal-dialog-buttons .goog-buttonset-default");
                btn[0].click();*/
              }
            },

            // CREATE BUTTONS ON TOOLTIP (calendar view)
            tooltipCreate:{
                html:function(){ return "&nbsp;<span id='fuzef' style='background-image:url(" + _fuzeUI.getURL("images/fuze_f.png") + ")'>&nbsp;</span> Fuze Meeting"; },
                inject:function(){
                    if ( $(".bubble div[class$=create-fuze-meeting]").length === 0 ) {
                        var evtCreate = $(".bubble div[class$=create-button]");
                        if ( evtCreate.length ) {
                            var fuzeCreate = $("<div>").html(evtCreate.html());
                            fuzeCreate.attr("class", evtCreate.attr("class").replace("create-button", "create-fuze-meeting"));
                            fuzeCreate.html(_fuzeUI.buttons.tooltipCreate.html());
                            evtCreate.after(fuzeCreate);
                        }
                    }

                    // TODO REMOVE: Dirty fix to handle old GCal
                    if ( $(".bubble span[id$=create-fuze-meeting]").length === 0 ) {
                        var evtCreate = $(".bubble span[id$=create-button]");
                        if ( evtCreate.length && evtCreate.find(".goog-imageless-button-content").length ) {
                            var fuzeCreate = $("<span>").html(evtCreate.html());
                            fuzeCreate.attr("id", evtCreate.attr("id").replace("create-button", "create-fuze-meeting"));
                            fuzeCreate.find(".goog-imageless-button-content").html(_fuzeUI.buttons.tooltipCreate.html());
                            evtCreate.parents("tr").attr("colspan", "3");
                            evtCreate.after(fuzeCreate);
                        }
                    }
                },
                attachEvents:function(){
                    $(".bubble div[class$=create-fuze-meeting]").on("click", function(e){
                        var editLink = $(".bubble div[class$=edit-button]");
                        if ( editLink.length > 0 ) {
                            editLink[0].click();
                            _fuzeUI.eventForm.wait(true);
                            setTimeout(function(){
                                _fuzeUI.eventForm.wait(true);
                                var meeting = _fuzeUI.eventForm.getMeetingObject();
                                if ($("span[id$='fuze-create']").length) {
                                    var validation = _fuzeUI.meeting.validate(meeting, "create");
                                    if ( validation.ok ) {
                                        _fuzeUI.meeting.create(meeting, function(created){
                                            _fuzeUI.eventForm.isCancelable = true;
                                            _fuzeUI.eventForm.isMeetingHost = true;
                                            _fuzeUI.eventForm.wait(false);
                                            if ( created && created.ok ) {
                                                var meeting = created.meeting;
                                                _fuzeUI.meeting.cache(meeting);
                                                _fuzeUI.eventForm.setMeetingInForm(meeting);
                                                _fuzeUI.buttons.eventFormButtons.inject({get:false});
                                                _fuzeUI.buttons.launchFuzeMeeting.inject();
                                            }
                                            else if ( created && created.message ) {
                                                _fuzeUI.notifications.error("create", created.meeting, created.message);
                                            }
                                        });
                                    }
                                }
                                else {
                                    _fuzeUI.eventForm.wait(false);
                                }
                            }, 1000);
                        }
                    });

                    // TODO REMOVE: Dirty fix to handle old GCal
                    $(".bubble span[id$=create-fuze-meeting]").on("click", function(e){
                        var editLink = $(".bubble a[id$=editLink]");
                        if ( editLink.length > 0 ) {
                            editLink[0].click();
                            _fuzeUI.eventForm.wait(true);
                            setTimeout(function(){
                                _fuzeUI.eventForm.wait(true);
                                var meeting = _fuzeUI.eventForm.getMeetingObject();
                                if ($("span[id$='fuze-create']").length) {
                                    var validation = _fuzeUI.meeting.validate(meeting, "create");
                                    if ( validation.ok ) {
                                        _fuzeUI.meeting.create(meeting, function(created){
                                            _fuzeUI.eventForm.isCancelable = true;
                                            _fuzeUI.eventForm.isMeetingHost = true;
                                            _fuzeUI.eventForm.wait(false);
                                            if ( created && created.ok ) {
                                                var meeting = created.meeting;
                                                _fuzeUI.meeting.cache(meeting);
                                                _fuzeUI.eventForm.setMeetingInForm(meeting);
                                                _fuzeUI.buttons.eventFormButtons.inject({get:false});
                                            }
                                            else if ( created && created.message ) {
                                                _fuzeUI.notifications.error("create", created.meeting, created.message);
                                            }
                                        });
                                    }
                                }
                                else {
                                    _fuzeUI.eventForm.wait(false);
                                }
                            }, 1000);
                        }
                    });
                }
            },

            // WHERE LINK ON TOOLTIP (calendar view)
            tooltipLaunch:{
                inject:function(){
                    var where = $(".bubble .neb-data");
                    var fuzeLink = _fuzeUI.common.matchMeetingUrl(where.html());

                    // TODO REMOVE: Dirty fix to handle old GCal
                    if (!fuzeLink) {
                        where = $(".bubble").find("table.eb-data");
                        fuzeLink = _fuzeUI.common.matchMeetingUrl(where.html());
                    }

                    if (fuzeLink) {
                        var id = fuzeLink.split("/").pop();
                        var joinButton = _fuzeUI.buttons.launchFuzeMeeting.html(id, fuzeLink, true);
                        if (joinButton.indexOf("<br>") === 0) {
                            joinButton = joinButton.replace("<br>", "");
                        }
                        where.find("tr:first td").html(joinButton);

                        $("[id$='fuze-launch-meeting']").on("click", _fuzeUI.buttons.launchFuzeMeeting.linkClicked);
                    }
                }
            },

            // DELETE BUTTONS ON TOOLTIP (calendar view)
            tooltipDelete:{
                inject: function() {
                    /*var tooltip = $(".bubble");
                    // The first child is the delete button when we are the host
                    var buttons = tooltip.find(".eb-footer .eb-action-link");
                    var firstAction = tooltip.find(".eb-footer .eb-actions-left .eb-action-link:first-child");
                    if (firstAction.length > 0 && firstAction.attr("id").match(/delete/i, "")) {
                        var btn = firstAction.hide().clone();
                        btn.attr("id", "delete_fuze");
                        btn.on("click", _fuzeUI.buttons.tooltipDelete.buttonClicked);
                        firstAction.after(btn);
                        btn.show();
                    } else if (buttons.length == 3) {
                        var deleteAction = tooltip.find(".eb-footer .eb-action-link[id$=delete]");
                        var btnDelete = deleteAction.hide().clone();
                        btnDelete.attr("id", "delete_fuze");
                        deleteAction.after(btnDelete);
                        btnDelete.show();
                        btnDelete.on("click", function(){
                            _fuzeUI.eventForm.isDeleting = true;
                            deleteAction[0].click();
                        });
                    }*/
                },
                buttonClicked: function() {
                    /*var tooltip = $(".bubble");
                    var where = _fuzeUI.common.stripUnicodeChars(tooltip.find("table.eb-data tr:first td").html());
                    var fuzeLink = _fuzeUI.common.matchMeetingUrl(where);
                    var id = fuzeLink.split("/").pop();
                    if ( id && !isNaN(id) ){
                        _fuzeUI.meeting.delete({id:id});
                    }
                    var btn = tooltip.find(".eb-footer .eb-actions-left .eb-action-link:first-child");
                    btn[0].click();*/
                }
            },
            eventFormCreate:{
                html:function(id){
                    return "" +
                    "<tr id='" + id + "-link-row' class='tr-meeting-link'>" +
                        "<th class='ep-dp-dt-th'><label id='" + id + "-label'>Fuze</label></th>" +
                        "<td class='ep-dp-dt-td'>" +
                            "<span id='" + id + "-create' class='lk-button' role='button' tabindex='0'>Make it a Fuze meeting</span>" +
                            "<span id='" + id + "-join-meeting'></span>" +
                        "</td>" +
                    "</tr>" +
                    "<tr id='" + id + "-type-row' class='tr-meeting-type'>" +
                        "<th class='ep-dp-dt-th'><label id='" + id + "-label'>Fuze meeting type</label></th>" +
                        "<td class='ep-dp-dt-td'>" +
                            "<select aria-labelledby='" + id + "-label'>" +
                                "<option id='" + id + "mt-o' value='O'>Open Meeting</option>" +
                                "<option id='" + id + "mt-p' value='R'>Private Meeting</option>" +
                                "<option id='" + id + "mt-w' value='W'>Large Meeting</option>" +
                            "</select>" +
                        "</td>" +
                    "</tr>";
                },
                inject:function(){
                    var table = $("table.ep-dp-dt");
                    if ($("tr[id$='fuze-link-row']").length) {
                        return;
                    }

                    var tableRow = table.find("tr:first");
                    if ( tableRow.length ) {
                        var id = tableRow.attr("id").split(".")[0] + ".fuze";
                        tableRow.after(_fuzeUI.buttons.eventFormCreate.html(id));
                        if ( _fuzeUI.eventForm.isMeetingHost ) {
                            $("tr[id$='fuze-link-row']:not(.host)").addClass("host");
                            $("tr[id$='fuze-type-row']:not(.host)").addClass("host");
                        }

                        $("[id$='launch-meeting']").on("click", _fuzeUI.buttons.launchFuzeMeeting.linkClicked);

                        _fuzeUI.buttons.eventFormCreate.attachEvents();
                    }
                },
                attachEvents:function(){
                    $("span[id$='fuze-create']").off("click").on("click", function(e){
                        if ( false === $(this).hasClass("wait") ) {
                            _fuzeUI.eventForm.wait(true);
                            var meeting = _fuzeUI.eventForm.getMeetingObject();
                            var validation = _fuzeUI.meeting.validate(meeting, "create");
                            if ( validation.ok ) {
                                _fuzeUI.meeting.cache(meeting);
                                _fuzeUI.meeting.create(meeting, function(response){
                                    _fuzeUI.eventForm.isCancelable = true;
                                    _fuzeUI.eventForm.isMeetingHost = true;
                                    _fuzeUI.eventForm.wait(false);
                                    if ( response && response.ok ) {
                                        var meeting = response.meeting;
                                        _fuzeUI.meeting.cache(meeting);
                                        _fuzeUI.eventForm.setMeetingInForm(meeting);
                                        _fuzeUI.buttons.eventFormButtons.inject({});
                                        _fuzeUI.buttons.launchFuzeMeeting.inject();
                                    }
                                    else if ( response && response.message ) {
                                        _fuzeUI.notifications.error("create", response.meeting, response.message);
                                    }
                                });
                            }
                            else if (validation.action) {
                                _fuzeUI.eventForm.wait(false);
                                _fuzeUI.sendMessage({
                                    action:validation.action,
                                    data:validation.data
                                }, function(){
                                    window.location = window.location;
                                });
                            }else{
                              _fuzeUI.eventForm.wait(false);
                            }
                        }
                    });
                }
            },

            // WHERE BUTTON
            launchFuzeMeeting: {
                linkWasClicked: false,
                isShowing:function(){ return $("[id$='fuze-launch-meeting']").length > 0; },

                // We are creating the element : 1. the link is not clickable
                html:function(id, fuzeLink, isRetrieveMeeting) {
                    // EXCEPTION FOR VANITY URL : WITHOUT MEETING ID, WE CAN'T LAUNCH THE MEETING
                    var isMeetingId = id.match(/([0-9]*)/img);
                    if (!isMeetingId[0]) {
                        if (fuzeLink) {
                            return "<span id='fuzef' style='background-image:url(" + _fuzeUI.getURL("images/fuze_f.png") + ")'>&nbsp;</span>" +
                                   "<a id='" + id + ".fuze-launch-meeting' class='eb-action-link lk' href='" + fuzeLink + "' target='_blank'>Join Fuze meeting</a>";
                        }else{
                            return "";
                        }
                    }

                    var dataUrl = '';
                    // We are getting the URL to launch the meeting
                    if (_fuzeUI.currentMeetingInstance && _fuzeUI.currentMeetingInstance.details && _fuzeUI.currentMeetingInstance.details.id == id) {
                        var meetingUrl = _fuzeUI.buttons.launchFuzeMeeting.createLink(_fuzeUI.currentMeetingInstance);
                        dataUrl = "data-url='" + meetingUrl + "'";
                        if (_fuzeUI.buttons.launchFuzeMeeting.linkWasClicked) { _fuzeUI.buttons.launchFuzeMeeting.launch(); }

                    // Avoid to have 2 call in the same time
                    } else if (isRetrieveMeeting) {
                        _fuzeUI.meeting.get({id: id}, function(response){
                            if (response && response.meeting) {
                                _fuzeUI.buttons.launchFuzeMeeting.createLink(response.meeting);

                                if (_fuzeUI.buttons.launchFuzeMeeting.linkWasClicked) {
                                    _fuzeUI.buttons.launchFuzeMeeting.launch();
                                }
                            }
                        });
                    }
                        
                    return "<span id='fuzef' style='background-image:url(" + _fuzeUI.getURL("images/fuze_f.png") + ")'>&nbsp;</span>" +
                           "<a id='" + id + ".fuze-launch-meeting' class='eb-action-link lk' data-meetingid='" + id + "' " + dataUrl + ">Join Fuze meeting</a>";
                },

                // We are adding the url : 2. the link is clickable
                createLink: function(meeting) {
                    if (meeting.details && meeting.details.viewUrl) {
                        var urlMatch = meeting.details.viewUrl.match('(http.*view_meeting\/)(.*)');
                        if (urlMatch.length) {
                            var base = urlMatch[1].replace("view_meeting", "fuze");
                            var stem = urlMatch[2].split('/')[0];
                            var meetingUrl = base + stem + '/' + meeting.details.id;

                            var linkEl = $("[id$='fuze-launch-meeting']")[0];
                            if (linkEl && linkEl.dataset && linkEl.dataset.meetingid == meeting.details.id) {
                                $("[id$='fuze-launch-meeting']").attr("data-url", meetingUrl);
                            }
                        }
                        return meetingUrl;
                    }

                    return false;
                },

                // The link has been clicked
                linkClicked: function(e) {
                    // 1. the link is not clickable : We wait for the url
                    if (!e.currentTarget.dataset.url) {
                        _fuzeUI.buttons.launchFuzeMeeting.linkWasClicked = true;

                    // 2. the link is clickable : We launch the meeting
                    }else{
                        _fuzeUI.buttons.launchFuzeMeeting.launch();
                    }
                },

                // Open the meeting in the Client
                launch: function(params) {
                    _fuzeUI.buttons.launchFuzeMeeting.linkWasClicked = false;
                    var linkEl = $("[id$='fuze-launch-meeting']")[0];
                    if (linkEl && linkEl.dataset && linkEl.dataset.url) {
                        var id = linkEl.dataset.meetingid;
                        var url = linkEl.dataset.url;
                        var name = linkEl.dataset.name;
                        var params = {
                            'meetingId': id,
                            'currentLaunchType': 'attendee',
                            'url': url,
                            'meetingNumber': id
                        };
                        FuzeAppLauncher.JoinMeetingWithNativeApp(params);
                    }
                },

                // Detail meeting view
                inject:function(){
                    var table = $("table.ep-dp-dt");
                    var fuzeLink = false;

                    // We first took the meeting URL from the 'where' input
                    var currentLocation = $(".ep-dp-input .textinput").val(); // host
                    var readonlyLocation = $(".ep-dp-input .ui-sch-schmedit").text(); // attendee
                    if (currentLocation) {
                        fuzeLink = _fuzeUI.common.matchMeetingUrl(currentLocation);
                    } else if (readonlyLocation) {
                        fuzeLink = _fuzeUI.common.matchMeetingUrl(readonlyLocation);
                    }

                    // When the 'where' value is not correct, we get it from the description
                    if ( !fuzeLink ) {
                        var description = "";
                        var editableDescription = table.find("textarea"); // host
                        var readonlyDescription = table.find("[id$='descript']"); // attendee
                        if (editableDescription.length) {
                            description = editableDescription.val();
                        }
                        else if (readonlyDescription.length){
                            description = readonlyDescription.text();
                        }

                        if ( description ) {
                            fuzeLink = _fuzeUI.common.matchMeetingUrl(description);
                        }
                    }

                    // Create the meeting link
                    if ( fuzeLink ) {
                        var id = fuzeLink.split("/").pop();

                        if (table.find("[id$='join-meeting']")) {
                            table.find("[id$='join-meeting']").html(_fuzeUI.buttons.launchFuzeMeeting.html(id, fuzeLink, false));
                            table.find("[id$='fuze-create']").hide();
                            table.find("[id$='fuze-launch-meeting']").show();
                            $("tr[id$='fuze-link-row']").show();

                            $("[id$='fuze-launch-meeting']").on("click", _fuzeUI.buttons.launchFuzeMeeting.linkClicked);
                        }
                    }
                }
            },
            // TOP BUTTONS ON EVENT EDITION
            eventFormButtons:{
                isShowing:function(){ return $("[id$=_top_fuze]").length > 0; },
                inject:function(options){
                    if ( !window.lock && !_fuzeUI.buttons.eventFormButtons.isShowing() ) {
                        options = options || {};
                        window.lock = true;
                        setTimeout(function(){
                            var container = $("[id$=btcb_top]").parent();
                            var buttonsToReplace = ["save", "cancel"];//, "delete"
                            $.each(buttonsToReplace, function(i, id){
                                var originalButton = container.find("[id$=" + id + "_top]");
                                if ( originalButton.length && originalButton.find(".goog-imageless-button-content").length ) {
                                    var btn = originalButton.hide().clone();
                                    btn.attr("id", btn.attr("id").replace(/_top/i, "_top_fuze"));
                                    btn.on("click", _fuzeUI.buttons.eventFormButtons.buttonClicked)
                                       .on("mouseenter mouseleave", _fuzeUI.buttons.eventFormButtons.buttonHovered);

                                    originalButton.after(btn);
                                    container.find("[id$=" + id + "_top_fuze]").show();
                                }
                            });

                            setTimeout(function(){ window.lock = undefined; }, 100);
                        }, 100);
                    }
                },
                buttonClicked:function(e){
                    if ( false === $(this).hasClass("wait") ) {
                        var btnId = $(this).attr("id").replace(/_fuze/i, "");
                        var match = btnId.match(/(save|cancel)/i);// |delete
                        var actionId = match.length > 0 ? match[1] : '';
                        if ( _fuzeUI.eventForm.isMeetingHost ) {
                            var meeting = _fuzeUI.eventForm.getMeetingObject();
                            // SAVE
                            if (actionId === "save") {
                                _fuzeUI.eventForm.isCancelable = false;
                                var meetingFuncName = "update";
                                if ($.isFunction(_fuzeUI.meeting[meetingFuncName])) {
                                    _fuzeUI.eventForm.wait(true);
                                    var validation = _fuzeUI.meeting.validate(meeting, meetingFuncName);
                                    if ( validation.ok ) {
                                        _fuzeUI.meeting.cache(meeting);
                                        _fuzeUI.meeting[meetingFuncName](meeting, function(updated){
                                            _fuzeUI.eventForm.wait(false);
                                            if ( updated.ok ) {
                                                _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                                            }
                                            else if ( updated.code == 403 ) {
                                                _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                                            }
                                            else if ( updated.message ) {
                                                _fuzeUI.notifications.error(meetingFuncName, meeting, updated.message);
                                            }
                                        });
                                    }
                                    else if (validation.action) {
                                        _fuzeUI.eventForm.wait(false);
                                        _fuzeUI.sendMessage({
                                            action:validation.action,
                                            data:validation.data
                                        }, function(){
                                            window.location = window.location;
                                        });
                                        callback(validation);
                                    }
                                    else {
                                       _fuzeUI.eventForm.wait(false);
                                       _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                                    }
                                }

                            // DELETE WITH GUEST : shows an alert
                            /*} else if (meeting && (actionId === "delete" && meeting.invitations > 1)) {
                                _fuzeUI.eventForm.isDeleting = true;
                                _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));

                            // DELETE OR CANCEL
                            } else if (meeting && (actionId === "delete" || (actionId === "cancel" && _fuzeUI.eventForm.isCancelable))) {
                                _fuzeUI.eventForm.wait(true);
                                _fuzeUI.meeting.delete(meeting, function(deleted){
                                    _fuzeUI.eventForm.wait(false);
                                    if ( deleted && deleted.ok ) {
                                        _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                                    }
                                });*/
                            } else {
                                _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                            }
                        } else {
                            _fuzeUI.buttons.native.click($("[id$=" + actionId + "_top]"));
                        }
                    }
                },
                buttonHovered:function(e){
                    if ( e.type == "mouseenter" ) {
                        $(this).find(".goog-imageless-button").addClass("goog-imageless-button-hover");
                    }
                }
            }
        }
    };

    document.addEventListener('DOMSubtreeModified', _fuzeUI.onDOMChange);

    $(document).on("ready", function(e){
        var location = top.location.href;
        if (location.match(/\/login\??(.*)/i) !== null && !_fuzeUI.env.active()) {
            _fuzeUI.env.initialize();
            _fuzeUI.env.active(true);
        }
    });
})();