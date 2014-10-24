var cheerio = require('cheerio');
var request = require('request');
var datetime = require('datetimejs');
var regex = require('named-regexp').named;

function get ( url, week, year ) {
	request(url, function ( error, response, body ) {
		if ( ! error && response.statusCode == 200 ) {
			parse_data(body, week, year);
	  	} else {
	  		// Error...
	  	}
	});
}

function zero_padding ( string ) {
    integer = parseInt(string, 0);
    if ( integer < 10 ) {
        return "0" + integer;
    } else {
    	return string;
    }
}

function parse_data ( response, week, year ) {
	$ = cheerio.load(response);

	if ( $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").length < 1 ) {
		console.log(" Wrong data! ");

		return false;
	}

	var timetable_rows = $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").find("tr")

	var module_info = [];
	var timetable_elements = []
	var headers = [];
	var holiday_elements = [];

	var header_regex = regex(/(:<day_name>.*) \((:<day>.*)\/(:<month>.*)\)/ig);
	var module_regex = regex(/(:<module_number>.*)\. (:<start_time>.*) - (:<end_time>.*)/ig);
	var time_regex = regex(/(:<start_hour>[0-9]*):(:<start_minute>[0-9]*) til (:<end_hour>[0-9]*):(:<end_minute>[0-9]*)/igm);
	var alternative_day_regex = regex(/(:<day>[0-9]*)\/(:<month>[0-9]*)-(:<year>[0-9]*)/ig);

	// Fetch the starting and ending times of the modules
	$("div.s2module-info").each( function ( index, element ) {
		var module_info_matches = module_regex.exec($(element).text().trim().replace("modul", ""));

		if ( module_info_matches != null && Object.keys(module_info_matches.captures).length > 0 ) {
			var start_time = module_info_matches.capture("start_time");

			if ( start_time.length < 5 ) {
				start_time = "0" + start_time;
			}

			var end_time = module_info_matches.capture("end_time");

			if ( end_time.length < 5 ) {
				end_time = "0" + end_time;
			}
		}
	} );

	// Find all the headers ( days )
	var header_rows = $(timetable_rows[1]).find("td");
	delete header_rows[0];

	$(header_rows).each( function ( index, element ) {
		element = $(element);
		console.log(element.text().trim());
		var header_groups = header_regex.exec(element.text().trim());
		console.log(header_groups);
		var header_year = year;

		if ( header_groups != null && header_groups.length > 0 ) {
			if ( parseInt(week, 0) == 1 && parseInt(header_groups.capture("month"), 0) ) {
				header_year = parseInt(year, 0) -1;
			}

			headers.push({
				"day" : header_groups.capture("day_name"),
				"date" :  datetime.strptime( zero_padding(header_groups.capture("day")) + "-" + zero_padding(header_groups.capture("month")) + "-" + header_year + " 12:00" % (zero_padding(header_groups.capture("day")), zero_padding(header_groups.capture("month")), header_year, "12:00"), "%d-%m-%Y %H:%M")
			});
		}
	} );

	// Find all the timetable elements
	var index = 0;
	var day_of_week = 1;
	var day_elements = $(timetable_rows[3]).find("td");

	$(day_elements).each( function ( day_index, day ) {
		day = $(day)
		var time_week = 0;

		index = index + 1;

		day_of_week = index;

		if ( day_of_week == 7 ) {
			day_of_week = 0;
		}

		if ( week == 1 ) {
			time_week = 0;
		} else {
			time_week = week - 1;
		}

		var day_timetable_elements = day.find("a");

		module_index = 1;

		// Holidays
		day.find(".s2module-bg").each( function ( holiday_index , holiday_element ) {
			holiday_element = $(holiday_element)
			if ( $(holiday_element).hasClass("s2time-off") ) {
				holiday_elements.push({
					"start_time" : datetime.strptime( headers[index-1]["date"].strftime("%d") + "-" + headers[index-1]["date"].strftime("%m") + "-" + headers[index-1]["date"].strftime("%Y") + " " + module_info[module_index-1]["start"], "%d-%m-%Y %H:%M"),
					"end_time" : datetime.strptime( headers[index-1]["date"].strftime("%d") + "-" + headers[index-1]["date"].strftime("%m") + "-" + headers[index-1]["date"].strftime("%Y") + " " + module_info[module_index-1]["end"], "%d-%m-%Y %H:%M"),
				});
			}

			module_index = module_index + 1
		} );

		// Expressions used to indentify the event type
		var event_expressions = [
			{"type" : "private", "expression" : regex(/\/lectio\/(:<school_id>[0-9]*)\/privat_aftale.aspx\?aftaleid=(:<activity_id>[0-9]*)/ig)},
			{"type" : "school",  "expression" : regex(/\/lectio\/(:<school_id>[0-9]*)\/aktivitet\/aktivitetinfo.aspx\?id=(:<activity_id>[0-9]*)&(:<prev_url>.*)/ig)},
			{"type" : "outgoing_censor", "expression" : regex(/\/lectio\/(:<school_id>.*)\/proevehold.aspx\?type=udgcensur&outboundCensorID=(:<outbound_censor_id>.*)&prevurl=(:<prev_url>.*)/ig)},
			{"type" : "exam", "expression" : regex(/\/lectio\/(:<school_id>.*)\/proevehold.aspx\?type=proevehold&ProeveholdId=(:<test_team_id>.*)&prevurl=(:<prev_url>.*)/ig)}
		];

		// Timetable Elements
		$(day_timetable_elements).each( function ( timetable_index, day_timetable_element ) {
			day_timetable_element = $(day_timetable_element)

			// Find event type
			var event_type = null;

			event_type = "other";
			var event_match = null;
			event_expressions.forEach( function ( expression, expression_index ) {
				console.log(expression_index);
				event_match = expression.expression.exec(day_timetable_element.attr("href"));

				if ( event_match != null && Object.keys(event_match.captures).length > 0 ) {
					event_type = expression.type;
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

			// Split the title into sections
			var main_sections = title_text.split("\n\n");

			var top_section = main_sections[0].split("\n");

			var is_changed_or_cancelled = 0;
			var is_cancelled = false;
			var is_changed = false;

			if ( top_section[0].indexOf("til") == "-1" ) {
				is_changed_or_cancelled = 1;

				if ( top_section[0].indexOf("Aflyst!") == "-1" ) {
					is_cancelled = true;
				} else {
					is_changed = true
				}
			}

			if ( time_match.length > 0 ) {
				var start_time = datetime.strptime([time_match.capture("start_hour"),time_match.capture("start_minute"), day_of_week, time_week, year].join(" "),"%H %M %w %W %Y");
				var end_time = datetime.strptime([time_match.capture("end_hour"),time_match.capture("end_minute"), day_of_week, time_week, year].join(" "),"%H %M %w %W %Y");
			} else {
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

				var start_time = datetime.strptime([zero_padding(alternative_start_day_match.capture("day")),zero_padding(alternative_start_day_match.capture("month")),alternative_start_day_match.capture("year"),start_time_section.trim()].join(" "),"%d/%m-%Y %H:%M");
				var end_time = datetime.strptime([zero_padding(alternative_end_day_match.capture("day")),zero_padding(alternative_end_day_match.capture("month")),alternative_end_day_match.capture("year"),end_time_section.trim()].join(" "),"%d/%m-%Y %H:%M");
			}

			var room_text = "";
			var room = "";

			if ( top_section[3 + is_changed_or_cancelled] != undefined && top_section[3 + is_changed_or_cancelled].indexOf("rer:") == "-1" ) {
				var room = top_section[3 + is_changed_or_cancelled].replace("Lokale: ", "").replace("r:", "");
			}

			if ( same_day(start_time, day_of_week, time_week, year) ) {
				switch ( event_type ) {
					case "private":
						timetable_elements.push({
							"text" : day_timetable_element.text(),
							"activity_id" : event_match.capture("activity_id"),
							"start_time" : start_time,
							"end_time" : end_time,
							"event_type" : event_type,
							"school_id" : event_match.capture("school_id")
						});
					break;

					case "outgoing_censor":
						timetable_elements.push({
							"text" : day_timetable_element.teactivity_idxt(),
							"activity_id" : event_match.capture("outbound_censor_id"),
							"start_time" : start_time,
							"end_time" : end_time,
							"event_type" : event_type,
							"school_id" : event_match.capture("school_id")
						});
					break;

					case "exam":
						timetable_elements.push({
							"text" : day_timetable_element.text(),
							"test_team_id" : event_match.capture("test_team_id"),
							"start_time" : start_time,
							"end_time" : end_time,
							"event_type" : event_type,
							"school_id" : event_match.capture("school_id")
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
							"text" : day_timetable_element.text(),
							"activity_id" : event_match.capture("activity_id"),
							"start_time" : start_time,
							"end_time" : end_time,
							"event_type" : event_type,
							"school_id" : event_match.capture("school_id"),
							"staus" : event_status,
							"teachers" : teachers,
							"teams" : teams,
							"location_text" : status_div.text(),
							"room_text" : room_text
						});
					break;
				}
			}
		} );
	} );
	
	console.log(timetable_elements);
}

function same_day ( date, day_of_week, week, year ) {
	var day_two = datetime.strptime("12 00" + day_of_week + " " + week + " " + year,"%H %M %w %W %Y");
	
	return day_two.date() == date.date();
}

get("https://www.lectio.dk/lectio/517/SkemaNy.aspx?type=elev&elevid=4789793691&week=412014",41, 2014);