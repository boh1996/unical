var cheerio = require('cheerio');
var request = require('request');
var regex = require('named-regexp').named;
var util = require('util');
var tough = require('tough-cookie');

function parseCookies (rc) {
	var list = {};

	rc && rc.split(';').forEach(function( cookie ) {
		var parts = cookie.split('=');
		list[parts.shift().trim()] = unescape(parts.join('='));
	});

	return list;
}


module.exports = {
	construct_url : function ( school_id, branch_id ) {
		return "https://www.lectio.dk/lectio/" + school_id + "/login.aspx?lecafdeling=" + branch_id;
	},

	authenticate : function ( school_id, branch_id, username, password, callback ) {
		var url = this.construct_url(school_id, branch_id);

		request({
			"url": url
		}, function ( error, response, body ) {
			if ( ! error && response.statusCode == 200 ) {
				var base = cheerio.load(body);

				if ( base("#aspnetForm").length == 0 ) {
					console.log("No form found!");
					callback(false);
					return false;
				}

				var eventValidation = "__EVENTVALIDATION=" + base("#aspnetForm").find("#__EVENTVALIDATION").val();
				var viewState = "__VIEWSTATEX=" + base("#__VIEWSTATEX").val();
				var data = encodeURIComponent("mContentusername2=" + username + "&mContentpassword2=" + password + "&time=0&__EVENTARGUMENT=&__VIEWSTATE=&" + eventValidation + "&__EVENTTARGET=mContentsubmitbtn2&" + viewState);
				var j = request.jar(new tough.CookieJar());

				request.post({
					url: url,
					jar: j,
					maxRedirects : 0,
					followAllRedirects  : false,
					form : {
						"__EVENTVALIDATION" :base("#aspnetForm").find("#__EVENTVALIDATION").val(),
						"__VIEWSTATEX" : base("#__VIEWSTATEX").val(),
						"m$Content$username2" : username,
						"m$Content$password2" : password,
						"__EVENTARGUMENT" : "",
						"time" : 0,
						"__EVENTTARGET" : "m$Content$submitbtn2"
					},
					headers : {
						"User-Agent" : "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.57.2 (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
						"Content-Type" : "application/x-www-form-urlencoded",
						"Referer" : url,
						"Host" : "www.lectio.dk",
						"Origin" : "https://www.lectio.dk",
						"Accept" : "/*",
						"CSP" : "active",
						"Accept-Encoding" : "gzip, deflate"
					},
					allowRedirect : false,
					followRedirect : false
				}, function ( error, response, body ) {
					var cookies = parseCookies(String(j.getCookieString("https://www.lectio.dk/lectio/")));
					if ( ! error && response.statusCode == 303 ) {
						if ( typeof callback == "function" ) {
							if ( "LastLoginUserName" in cookies ) {
								callback(j);
							} else {
								console.log("Wrong something!");
								callback(false);
							}
						}
					} else {
						console.log("Error while signing into Lectio!", response.statusCode);
						callback(false);
					}
				});
			} else {
				console.log("Error requesting Lectio!", response.statusCode);
				callback(false);
			}
		});
	}
}