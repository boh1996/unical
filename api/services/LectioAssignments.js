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
					callback(false);
				}
			}
		});
	},

	parse_data : function ( student_id, response ) {
		var $ = cheerio.load(response);

		if ( $("#s_m_Content_Content_ExerciseGV") == null ) {
			return false;
		}

		var rows = $("#s_m_Content_Content_ExerciseGV").find("tr");

		delete rows[0];

		var assignments = [];

		var pattern = /(.*)\/(.*)-(.*) (.*)/i;


		var student_time = 0.0;

		$(rows).each( function ( index, element ) {
			var elements = $(element).find("td");
			
			if ( elements[3] != undefined ) {
				var result = pattern.exec($(elements[3]).text().trim());
				var start_time = moment.tz(result[3] + "-" + zero_padding(result[2]) + "-" + zero_padding(result[1]) + " " + result[4], "Europe/Copenhagen").toDate();
				assignments.push({
					"student_note" : $(elements[10]).text().trim(),
					"grade" : $(elements[9]).text().trim(),
					"note" : $(elements[8]).text().trim(),
					"waiting_for" : $(elements[7]).text().trim(),
					"leave" : $(elements[6]).text().trim(),
					"status" : $(elements[5]).text().trim(),
					"student_time" : parseFloat($(elements[4]).text().trim().replace(",", ".")),
					"time" : start_time,
					"title" : $(elements[2]).text().trim(),
					"team" : $(elements[1]).text().trim(),
					"student_id" : String(student_id)
				});
			}
			if ( ! isNaN(parseFloat($(elements[4]).text().trim().replace(",", "."))) ) {
				student_time = student_time + parseFloat($(elements[4]).text().trim().replace(",", "."));
			}
		} );

		console.log(student_time);

		Lectio_assignments.destroy({
			"student_id" : String(student_id)
		}).exec(function deleteCB(err){
			console.log(err);
  			console.log('The record has been deleted');
  			// Insert the new
			assignments.forEach( function ( assignment_insert_element, assignment_insert_index ) {
				Lectio_assignments.create(assignment_insert_element).exec(function createCB(err,created){
	  				
	  			});
			});
			/*if ( typeof callback == "function" ) {
				callback(true);
			}*/
  		});
	},

	get : function ( school_id, branch_id, student_id, username, password ) {
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
										LectioAssignments.parse_data(student_id, body);
									} else {
										console.log("No Body!");
									}
								});
							} else {
								console.log("Failed First");
							}
						});
					}
				});
			} else {
				console.log("Sign-in failed!");
			}
		});
	}
}