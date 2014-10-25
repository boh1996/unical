var cheerio = require('cheerio');
var request = require('request');
var datetime = require('datetimejs');
var regex = require('named-regexp').named;
var moment = require('moment');
var momenttimezone = require('moment-timezone');
// moment().format(); <-- What does it even do??

// Adds a leading zero to numbers less than 10, to ensure the right format for dates and months,
// it turns 9 into 09
function zero_padding ( string ) {
	integer = parseInt(string, 0);
	if ( integer < 10 ) {
		return "0" + integer;
	} else {
		return string;
	}
}

// Checks if the day of to events is the same
function same_day ( date, day_of_week, week, year ) {
	var day_two = moment(year+"-W" + week + "-" + day_of_week + " 12:00");

	return day_two.isSame(date, 'day');
}

// The LectioTimetable service in api/services
module.exports = {

	construct_url : function ( week, year, user_id, school_id ) {
		return "https://www.lectio.dk/lectio/" + school_id + "/SkemaNy.aspx?type=elev&elevid=" + user_id + "&week=" + zero_padding(week) + year;
	},

	// Retrives the data, and calls the parse_data function of this service
	get : function ( school_id, user_id, term, week ) {

		url = this.construct_url(week, term, user_id, school_id);

		request({
			"url": url,
			"headers": {
				"s$m$ChooseTerm$term": term
			}
		}, function ( error, response, body ) {
			if ( ! error && response.statusCode == 200 ) {
				LectioTimetable.parse_data(body, week, term, user_id, school_id);
			} else {
				// Error...
			}
		});
	},

	// Parses the retrieves Lectio data
	parse_data : function ( response, week, term, user_id, school_id ) {
		if ( week < 30 ) {
			var year = parseInt(term) + 1;
		} else {
			var year = term;
		}

		$ = cheerio.load(response);

		// If this table doesn't exist, an error occured while recieving data
		if ( $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").length < 1 ) {
			console.log(" Wrong data! ");

			return false;
		}

		// Expressions used to indentify the event type
		var event_expressions = [
			{"type" : "private", "expression" : regex(/\/lectio\/(:<school_id>[0-9]*)\/privat_aftale.aspx\?aftaleid=(:<activity_id>[0-9]*)/ig)},
			{"type" : "school",  "expression" : regex(/\/lectio\/(:<school_id>[0-9]*)\/aktivitet\/aktivitetinfo.aspx\?id=(:<activity_id>[0-9]*)&(:<prev_url>.*)/ig)},
			{"type" : "outgoing_censor", "expression" : regex(/\/lectio\/(:<school_id>.*)\/proevehold.aspx\?type=udgcensur&outboundCensorID=(:<outbound_censor_id>.*)&prevurl=(:<prev_url>.*)/ig)},
			{"type" : "exam", "expression" : regex(/\/lectio\/(:<school_id>.*)\/proevehold.aspx\?type=proevehold&ProeveholdId=(:<test_team_id>.*)&prevurl=(:<prev_url>.*)/ig)}
		];

		// Create a list of all the different rows in the timetable
		var timetable_rows = $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").find("tr")

		// Variable storing the info about modules, 5. module is from 09 - 09.45 etc
		var module_info = [];

		// Stores all the retrieved timetable elements as objects
		var timetable_elements = []

		// The day headers, with dates for parsing reasons
		var headers = [];

		// Stores elements parsed as holidays
		var holiday_elements = [];

		// Regex for parsing the headers in the format suplied etc Torsdag (6/10)
		var header_regex = regex(/(:<day_name>.*) \((:<day>.*)\/(:<month>.*)\)/ig);

		// Regex for parsing the module deffinitions
		var module_regex = regex(/(:<module_number>.*)\. (:<start_time>.*) - (:<end_time>.*)/ig);

		// Regex for parsing the start and end time from the event multiline description
		var time_regex = regex(/(:<start_hour>[0-9]*):(:<start_minute>[0-9]*) til (:<end_hour>[0-9]*):(:<end_minute>[0-9]*)/igm);
		
		// The alternative regex for parsing days, yes there are more than one format
		var alternative_day_regex = regex(/(:<day>[0-9]*)\/(:<month>[0-9]*)-(:<year>[0-9]*)/ig);

		// Fetch the starting and ending times of the modules
		$("div.s2module-info").each( function ( index, element ) {
			var module_info_matches = module_regex.exec($(element).text().trim().replace("modul", ""));

			// If the module info is in the right format
			if ( module_info_matches != null && Object.keys(module_info_matches.captures).length > 0 ) {
				var start_time = module_info_matches.capture("start_time");

				// If needed, add  zero padding, to ensure the correct time format
				if ( start_time.length < 5 ) {
					start_time = "0" + start_time;
				}

				var end_time = module_info_matches.capture("end_time");

				// Add leading zero if needed to ensure correct time format
				if ( end_time.length < 5 ) {
					end_time = "0" + end_time;
				}
			}
		} );

		// Find all the headers ( days )
		var header_rows = $(timetable_rows[1]).find("td");
		delete header_rows[0];

		// Loop over the headers(day headers) and parse them, to retrieves dates
		$(header_rows).each( function ( index, element ) {
			element = $(element);

			// Match the header names with the regex
			var header_groups = header_regex.exec(element.text().trim());

			// If random error, try one more
			if ( header_groups == null ) {
				header_groups = header_regex.exec(element.text().trim()); // The bullshit level on this one is absurd
			}

			// Variable used, because there can be more than one year per week
			var header_year = year;

			// If year changed, this day could be in the old year, add it
			if ( header_groups != null && header_groups.length > 0 ) {
				if ( parseInt(week, 0) == 1 && parseInt(header_groups.capture("month"), 0) ) {
					header_year = parseInt(year, 0) -1;
				}

				// Add the header to the list, with dayname and the date
				headers.push({
					"day" : header_groups.capture("day_name"),
					"date" :  moment.tz(header_year + "-" + zero_padding(header_groups.capture("month")) + "-" + zero_padding(header_groups.capture("day")) + " 12:00", "Europe/Copenhagen")
				});
			}
		} );

		// Find all the timetable elements
		var index = 0;

		// Day of the week, sunday is 0
		var day_of_week = 1;

		// Find all the timetable elements of this day
		var day_elements = $(timetable_rows[3]).find("td");
		delete day_elements[0]

		// Loop over them and parse them into the timetable_elements list
		$(day_elements).each( function ( day_index, day ) {
			day = $(day)

			// The weeknumber starts at 0...
			var time_week = 0;

			index = index + 1;

			day_of_week = index;

			// Sunday is zero
			if ( day_of_week == 7 ) {
				day_of_week = 0;
			}

			// If the week is the first week of the year, its 0 in the calendar and 01 on Lectios
			if ( week == 1 ) {
				time_week = 0;
			} else {
				time_week = week - 1;
			}

			//
			var day_timetable_elements = day.find("a");

			module_index = 1;

			// Holidays
			/*day.find(".s2module-bg").each( function ( holiday_index , holiday_element ) {
				holiday_element = $(holiday_element)
				if ( $(holiday_element).hasClass("s2time-off") ) {
					holiday_elements.push({
						"start_time" : datetime.strptime( headers[index-1]["date"].strftime("%d") + "-" + headers[index-1]["date"].strftime("%m") + "-" + headers[index-1]["date"].strftime("%Y") + " " + module_info[module_index-1]["start"], "%d-%m-%Y %H:%M"),
						"end_time" : datetime.strptime( headers[index-1]["date"].strftime("%d") + "-" + headers[index-1]["date"].strftime("%m") + "-" + headers[index-1]["date"].strftime("%Y") + " " + module_info[module_index-1]["end"], "%d-%m-%Y %H:%M"),
					});
				}

				module_index = module_index + 1
			} );*/

			// Timetable Elements
			$(day_timetable_elements).each( function ( timetable_index, day_timetable_element ) {

				day_timetable_element = $(day_timetable_element)

				// Find event type
				var event_type = null;

				event_type = "other";
				var event_match = null;
				event_expressions.forEach( function ( expression, expression_index ) {
					var match = expression.expression.exec(day_timetable_element.attr("href"));

					if ( match == null ) {
						match = expression.expression.exec(day_timetable_element.attr("href")); // TODO: FUCKING BULLSHIT
					}

					if ( match != null && Object.keys(match.captures).length > 0 ) {
						event_type = expression.type;
						event_match = match;
					}
				} );

				// Locate the status div
				var status_div = day_timetable_element.find(".s2skemabrikcontent");

				// A list holding the teachers
				var teachers = []

				// A list holding the teams
				var teams = []

				// Fetch teams and teachers
				day_timetable_element.find("span").each( function ( info_span_index, info_span_element ) {
					info_span_element = $(info_span_element)
					var context_card_id = info_span_element.attr("lectiocontextcard");

					if ( context_card_id.length > 0 ) {
						if ( context_card_id.substring(0, 1) == "H" ) {
							teams.push({
								"context_card_id" : context_card_id,
								"title" : info_span_element.text(),
								"team_id" : context_card_id.replace("HE", "")
							});
						} else if ( context_card_id.substring(0, 1) == "T" ) {
							teachers.push({
								"abbrevation" : info_span_element.text(),
								"context_card_id" : context_card_id,
								"teacher_id" : context_card_id.replace("T", "")
							});
						}
					}
				} );

				// Store the titletext, where start and end times can be extracted from
				var title_text = day_timetable_element.attr("title");
				var time_match = time_regex.exec(title_text);

				// If title matching fucks, try again
				if ( time_match == null ) {
					time_match = time_regex.exec(title_text); // The bullshit level on this one is absurd
				}

				// Split the title into sections
				var main_sections = title_text.split("\n\n");

				var top_section = main_sections[0].split("\n");

				var is_changed_or_cancelled = 0;
				var is_cancelled = false;
				var is_changed = false;

				// Check if event is changed or cancelled
				if ( top_section[0].indexOf("til") == "-1" ) {
					is_changed_or_cancelled = 1;

					if ( top_section[0].indexOf("Aflyst!") == "-1" ) {
						is_cancelled = true;
					} else {
						is_changed = true
					}
				}

				// Match the event times, from the text using regex
				if ( time_match.length > 0 ) {
					var start_time = moment.tz(year+"-W" + time_week + "-" + day_of_week + " " + time_match.capture("start_hour") + ":" + time_match.capture("start_minute"), "Europe/Copenhagen");
					var end_time = moment.tz(year+"-W" + time_week + "-" + day_of_week + " " + time_match.capture("end_hour") + ":" + time_match.capture("end_minute"), "Europe/Copenhagen");

				} else {
					// Grap the different time, from the text sections

					var date_sections = top_section[0 + is_changed_or_cancelled].split(" ");
					var start_date_section = 0;
					var end_date_section = 0;
					var start_time_section = 0;
					var end_time_section = 0;

					if ( date_sections.length == 4 ) {
						start_time_section = date_sections[0];
						end_date_section = date_sections[0];

						start_time_section = date_sections[1];
						end_time_section = date_sections[3];
					} else {
						start_time_section = date_sections[0];
						end_date_section = date_sections[3];

						start_time_section = date_sections[1];
						end_time_section = date_sections[4];
					}

					var alternative_start_day_match = alternative_day_regex.exec(start_date_section.trim());
					var alternative_end_day_match = alternative_day_regex.exec(end_date_section.trim());

					var start_time = moment.tz(alternative_start_day_match.capture("year") + "-" + zero_padding(alternative_start_day_match.capture("month")) + "-" + zero_padding(alternative_start_day_match.capture("day")) + " " + start_time_section.trim(), "Europe/Copenhagen");
					var end_time = moment.tz(alternative_end_day_match.capture("year") + "-" + zero_padding(alternative_end_day_match.capture("month")) + zero_padding(alternative_end_day_match.capture("day")) + " " + end_time_section.trim(), "Europe/Copenhagen");

				}

				var room_text = "";
				var room = "";

				// Grap the room text
				if ( top_section[3 + is_changed_or_cancelled] != undefined && top_section[3 + is_changed_or_cancelled].indexOf("rer:") == "-1" ) {
					var room = top_section[3 + is_changed_or_cancelled].replace("Lokale: ", "").replace("r:", "");
				}

				start_time = start_time.toDate();
				end_time = end_time.toDate();

				// Only insert if the current day is the events starting day
				if ( same_day(start_time, day_of_week, time_week, year) ) {
					switch ( event_type ) {
						case "private":
							timetable_elements.push({
								"text" : day_timetable_element.text().trim(),
								"activity_id" : event_match.capture("activity_id"),
								"start_time" : start_time,
								"end_time" : end_time,
								"event_type" : event_type,
								"school_id" : event_match.capture("school_id"),
								"week" : week,
								"year" : year,
								"user_id" : user_id
							});
						break;

						case "outgoing_censor":
							timetable_elements.push({
								"text" : day_timetable_element.text().trim(),
								"activity_id" : event_match.capture("outbound_censor_id"),
								"start_time" : start_time,
								"end_time" : end_time,
								"event_type" : event_type,
								"school_id" : event_match.capture("school_id"),
								"week" : week,
								"year" : year,
								"user_id" : user_id
							});
						break;

						case "exam":
							timetable_elements.push({
								"text" : day_timetable_element.text().trim(),
								"test_team_id" : event_match.capture("test_team_id"),
								"start_time" : start_time,
								"end_time" : end_time,
								"event_type" : event_type,
								"school_id" : event_match.capture("school_id"),
								"week" : week,
								"year" : year,
								"user_id" : user_id
							});
						break;

						case "school":
							var event_status = "normal";

							if ( status_div.hasClass("s2changed") ) {
								event_status = "changed";
							} else if ( status_div.hasClass("s2cancelled") ) {
								event_status = "cancelled"
							}

							timetable_elements.push({
								"text" : day_timetable_element.text().trim(),
								"activity_id" : event_match.capture("activity_id"),
								"start_time" : start_time,
								"end_time" : end_time,
								"event_type" : event_type,
								"school_id" : event_match.capture("school_id"),
								"status" : event_status,
								"teachers" : teachers,
								"teams" : teams,
								"location_text" : status_div.text().trim(),
								"room_text" : room_text.trim(),
								"week" : week,
								"year" : year,
								"user_id" : user_id
							});
						break;
					}
				}
			} );
		} );

		console.log( week, year );
		
		// Remove Existing
		Lectio.destroy({
			"week" : week,
			"year" : year,
			"user_id" : user_id,
			"school_id" : school_id
		}).exec(function deleteCB(err){
  			console.log('The record has been deleted');
  			// Insert the new
			timetable_elements.forEach( function ( timetable_insert_element, timetable_element_index ) {
				Lectio.create(timetable_insert_element).exec(function createCB(err,created){
	  				console.log('Created event ' + created.activity_id);
	  			});
			});
  		});
	}
}