Options = (function(){
	var _options = {
		attachEvents:function(){
			var page = $("body#options");
			page.find("button#save").on("click", function(e){
				_options.dateFormat(page.find("div#dateFormat select#format option:selected").attr("value"), function(response){
					_options.showResponseNotification(response.dateFormat);
					_options.displaySelectedFormat()
				})

			});
      page.find("button#logout").on("click", function(e){
        chrome.storage.local.remove(["access_token", "expires_in"]);
        Fuze.Logout(function(){
          $("button#logout").hide();
          $("button#login").show();
        });
      });
      page.find("button#login").on("click", function(e){
        Fuze.Login(function(authResponse){
          if (authResponse.ok) {
            $("button#logout").show();
            $("button#login").hide();
          }
        });
      });

			_options.displaySelectedFormat()
		},
		showResponseNotification:function(date) {
			var dateSection = $("body#options div#dateFormat");
			var notification = dateSection.find("span.notification").removeClass("bad");
			var text = "Failed to save. Please try again";
			if ( date ) {
		    	text = "Saved"
		    }
		    else {
		    	notification.addClass("bad")
		    }

		    notification.text(text).fadeIn().fadeOut(3000)
		},
		displaySelectedFormat:function(){
			var dateSection = $("body#options div#dateFormat");
			_options.dateFormat(function(response){
			    if ( response.dateFormat ) {
			    	dateSection.find("label[for='format'] span").text(response.dateFormat);
			    	dateSection.find("select#format").val(response.dateFormat)
			    }
			})
		},
		dateFormat:function(value, callback) {
			var message = {action:"dateFormat"};
			if ( $.isFunction(value) && !callback ) {
				callback = value;
				value = undefined
			}

			if ( value ) {
				message.data = value
			}

			chrome.runtime.sendMessage(message, callback)
		}
	};

	$(document).ready(function(e){
		_options.attachEvents();
    chrome.storage.local.get("access_token", function(items){
      if ( items.access_token ) {
        $("button#logout").show();
      } else {
        $("button#login").show();
      }
    })
	});
})();

