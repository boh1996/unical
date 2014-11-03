/**
 * LectioController
 *
 * @description :: Server-side logic for managing lectios
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */
var ical = require('ical-generator');

module.exports = {
	timetable: function (req, res) {
		var params = req.params;

		Lectio_sections.find({user_id : params.section}).exec(function findCB(find_error, user){
			if (  user.length == 0 ) {
				Lectio_sections.create({school_id: params.branch, user_id: params.section}).exec(function createCB(createError, createResult) {
					LectioUser.get(params.section, params.branch, function (user){
						var cal = ical();

						cal.setDomain('unical.illution.dk').setName("Lectio - " + user.name);

						res.setHeader('Content-Type', 'text/calendar');
						res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

						console.log("Send");

						return res.send(cal.toString().replace('\n', '\r\n'));
					});
				});
			} else {
				Lectio_timetable.find({school_id: params.branch, user_id: params.section, year: params.year}).exec(function findCB(error,found){
					var cal = ical();

					cal.setDomain('unical.illution.dk').setName("Lectio - " + user[0].name);

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

