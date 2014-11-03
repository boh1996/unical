/**
 * LectioController
 *
 * @description :: Server-side logic for managing lectios
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */
var ical = require('ical-generator');
var moment = require('moment');

function returnCalendar ( res, params, user ) {
	Lectio_timetable.find({school_id: params.branch, user_id: params.section, year: params.year}).exec(function findCB(error,found){
		var cal = ical();
		cal.setDomain('unical.illution.dk');

		if ( user != false ) {
			cal.setName("Lectio - " + user.name);
		} else {
			cal.setName("Lectio - Working");
		}

		found.forEach(function (event, index) {
			var event_object = {
				start: 			event.start_time,
				end: 			event.end_time,
				summary: 		event.text.trim(),
				description: 	event.text.trim(),
				location: 		event.location_text.trim()
			};

			if ( event.hasOwnProperty("url") ) {
				event_object.url = event.url;
			}

			cal.addEvent(event_object);
		});
		res.setHeader('Content-Type', 'text/calendar');
		res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

		return res.send(cal.toString().replace('\n', '\r\n'));
	});
}

module.exports = {
	timetable: function (req, res) {
		var params = req.params;

		Lectio_sections.find({user_id : params.section}).exec(function findCB(find_error, user){
			if (  user.length == 0 ) {
				Lectio_sections.create({school_id: params.branch, user_id: params.section}).exec(function createCB(createError, createResult) {
					LectioUser.get(params.section, params.branch, function (userResponse){
						var cal = ical();
						cal.setDomain('unical.illution.dk');

						if ( userResponse != false ) {
							cal.setName("Lectio - " + userResponse.name);
						} else {
							cal.setName("Lectio - Working");
						}

						res.setHeader('Content-Type', 'text/calendar');
						res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

						var now = moment(Date.now());
						LectioTimetable.get(params.branch, params.section, params.year, now.format("ww"), function ( success ) {
							if ( success == true ) {
								returnCalendar(res, params, userResponse);
							} else {
								return res.send(cal.toString().replace('\n', '\r\n'));
							}
						});
					});
				});
			} else {
				returnCalendar( res, params, user[0] );
			}
		});
	},

	collect: function (req, res) {
		var params = req.params;
		LectioTimetable.get(params.branch, params.section, params.year, params.week);
		return res.send("Collection");
	},

	collect_all: function (req, res) {
		var params = req.params;

		for (var week = 31; week <= 46; week++) {
			LectioTimetable.get(params.branch, params.section, params.year, week);
		}

		return res.send("Working on it, bitch!")
	}
};

