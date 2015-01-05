var cheerio = require('cheerio');
var request = require('request');
var datetime = require('datetimejs');
var regex = require('named-regexp').named;
var moment = require('moment');
var momenttimezone = require('moment-timezone');
var util = require('util');
var tough = require('tough-cookie');

function zero_padding ( string ) {
	integer = parseInt(string, 0);
	if ( integer < 10 ) {
		return "0" + integer;
	} else {
		return string;
	}
}

function construct_time (year, month, day, hour, minute) {
	return moment.tz(
		moment()
		.zone("Frederiks Mor")
		.year(year)
		.month(month)
		.date(day)
		.hour(hour)
		.minute(minute)
		.second(0)
		.format().split("+")[0],
		"Europe/Copenhagen"
	);
}

module.exports = {
	construct_url : function ( school_id, student_id ) {
		return "https://www.lectio.dk/lectio/" + school_id + "/OpgaverElev.aspx?elevid=" + student_id;
	},

	make_request : function ( url, form, cookies, callback ) {
		request.post({
			url: url,
			jar: cookies,
			maxRedirects : 0,
			followAllRedirects  : false,
			form : form,
			headers : {
				"User-Agent" : "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.57.2 (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
				"Content-Type" : "application/x-www-form-urlencoded",
		        "Referer" : url,
		        "Host" : "www.lectio.dk",
		        "Origin" : "https://www.lectio.dk",
		        "Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
			},
			allowRedirect : false,
			followRedirect : false
		}, function ( error, response, body ) {
			if ( ! error && ( response.statusCode == 200 || response.statusCode == 302 ) ) {
				if ( typeof callback == "function" ) {
					callback(body);
				}
			} else {
				if ( typeof callback == "function" ) {
					console.log("Request Error!");
					callback(false);
				}
			}
		});
	},

	parse_data : function ( student_id, response, callback ) {
		var $ = cheerio.load(response);

		if ( $("#s_m_Content_Content_ExerciseGV") == null ) {
			console.log("Content failed!");
			return false;
		}

		console.log("Parsing data!");

		var rows = $("#s_m_Content_Content_ExerciseGV").find("tr");

		delete rows[0];

		var assignments = [];

		var pattern = /(.*)\/(.*)-(.*) (.*):(.*)/i;


		var student_time = 0.0;

		$(rows).each( function ( index, element ) {
			var elements = $(element).find("td");
			
			if ( elements[3] != undefined ) {
				var result = pattern.exec($(elements[3]).text().trim());
				var start_time = construct_time(result[3], result[2], result[1], result[4], result[5] );
				var event_start_time = moment(parseInt(start_time.format("X")) - ( parseFloat($(elements[4]).text().trim().replace(",", ".")) * 3600 ),"X").toDate();

				assignments.push({
					"student_note" : $(elements[10]).text().trim(),
					"grade" : $(elements[9]).text().trim(),
					"note" : $(elements[8]).text().trim(),
					"waiting_for" : $(elements[7]).text().trim(),
					"leave" : $(elements[6]).text().trim(),
					"status" : $(elements[5]).text().trim(),
					"student_time" : parseFloat($(elements[4]).text().trim().replace(",", ".")),
					"time" : start_time.toDate(),
					"event_start_time" : event_start_time,
					"title" : $(elements[2]).text().trim(),
					"team" : $(elements[1]).text().trim(),
					"student_id" : String(student_id),
					"url" : "https://www.lectio.dk" + $(elements[2]).find("a").attr("href")
				});
			}
			if ( ! isNaN(parseFloat($(elements[4]).text().trim().replace(",", "."))) ) {
				student_time = student_time + parseFloat($(elements[4]).text().trim().replace(",", "."));
			}
		} );

		console.log("Collected!");

		Lectio_assignments.destroy({
			"student_id" : String(student_id)
		}).exec(function deleteCB(err){
			if ( err != null ) {
				console.log(err);
			}
  			console.log('The record has been deleted');
  			// Insert the new
			assignments.forEach( function ( assignment_insert_element, assignment_insert_index ) {
				Lectio_assignments.create(assignment_insert_element).exec(function createCB(err,created){
	  				
	  			});
			});
			if ( typeof callback == "function" ) {
				callback(true);
			}
  		});
	},

	get : function ( school_id, branch_id, student_id, username, password, callback ) {
		var session = LectioAuthenticate.authenticate(school_id, branch_id, username, password, function ( cookies ) {
			if ( cookies != false ) {
				var url = LectioAssignments.construct_url(school_id, student_id);
				LectioAssignments.make_request(url, {
				}, cookies, function ( value ) {
					if ( value != false ) {
						var base = cheerio.load(value);
						LectioAssignments.make_request(url, {
							"__EVENTTARGET" : "s$m$Content$Content$CurrentExerciseFilterCB",
							"s$m$Content$Content$ShowThisTermOnlyCB" : "",
							"__EVENTVALIDATION" :base("#aspnetForm").find("#__EVENTVALIDATION").val(),
							"__VIEWSTATEX" : base("#__VIEWSTATEX").val()
						}, cookies, function ( value ) {
							if ( value != false ) {
								var base = cheerio.load(value);
								LectioAssignments.make_request(url, {
									"__EVENTTARGET" : "s$m$Content$Content$ShowThisTermOnlyCB",
									"__EVENTVALIDATION" :base("#aspnetForm").find("#__EVENTVALIDATION").val(),
									"__VIEWSTATEX" : base("#__VIEWSTATEX").val(),
								}, cookies, function ( body ) {
									if ( body != false ) {
										LectioAssignments.parse_data(student_id, body, callback);
									} else {
										console.log("No Body!");

										if ( typeof callback == "function" ) {
											callback(false);
										}
									}
								});
							} else {
								console.log("Failed First");

								if ( typeof callback == "function" ) {
									callback(false);
								}
							}
						});
					}
				});
			} else {
				console.log("Sign-in failed!");

				if ( typeof callback == "function" ) {
					callback(false);
				}
			}
		});
	}
}