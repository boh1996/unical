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
		// [ branch: '517', section: 'asdasd', year: '2014' ]
		//return res.json();
		Lectio_timetable.find({school_id: params.branch, user_id: params.section, year: params.year}).exec(function findCB(error,found){
			if (found.length == 0) {
				return res.send("Nope :(");
			} 

			var cal = ical();

			cal.setDomain('unical.co').setName('It\'s very awesome!');

			found.forEach(function (event, index) {
				cal.addEvent({
					start: 			event.start_time,
					end: 			event.end_time,
					summary: 		event.text.trim(),
					description: 	event.text.trim(),
					location: 		event.location_text.trim()
				});
			});
			res.setHeader('Content-Type', 'text/calendar');
			res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

			Lectio_sections.find({school_id: params.branch, user_id: params.section}).exec(function findCB(err, result){
				console.log(result.length);
				if ( result.length == 0 ) {
					Lectio_sections.create({school_id: params.branch, user_id: params.section}).exec(function createCB(createError, createResult) {
						LectioUser.get(params.section, params.branch);
					});
				}
			});

			return res.send(cal.toString().replace('\n', '\r\n'));
		});
	},

	collect: function (req, res) {
		var params = req.params;
		// [ branch: '517', section: 'asdasd', year: '2014', week: '42' ]
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

