/**
 * LectioController
 *
 * @description :: Server-side logic for managing lectios
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */
var ical = require('ical-generator');
var moment = require('moment');
var ObjectId = require('mongodb').ObjectID;
var Socks5ClientHttpsAgent = require('socks5-https-client/lib/Agent');
var request = require('request');

function returnCalendar ( res, params, user ) {
	Lectio_timetable.find({school_id: params.branch, user_id: params.section}).exec(function findCB(error,found){
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
				location: 		event.location_text.trim(),
				status: 		(event.status == 'cancelled' ? 'cancelled' : 'confirmed')
			};

			if ( event.hasOwnProperty("url") ) {
				event_object.url = event.url;
			}

			cal.addEvent(event_object);
		});
		res.setHeader('Content-Type', 'text/calendar; charset=UTF-8');
		res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

		return res.send(cal.toString().replace('\n', '\r\n'));
	});
}

function returnAssignmentCalendar ( res, user_id, user ) {
	Lectio_assignments.find({student_id: user_id}).exec(function findCB(error,found){
		var cal = ical();
		cal.setDomain('unical.illution.dk');

		if ( user != false ) {
			cal.setName("Lectio Assignments - " + user.name);
		} else {
			cal.setName("Lectio Assignments - Working");
		}

		found.forEach(function (event, index) {
			var event_object = {
				start: 			event.event_start_time,
				end: 			event.time,
				summary: 		event.title.trim(),
				description: 	event.title.trim()
			};

			if ( event.hasOwnProperty("url") ) {
				event_object.url = event.url;
			}

			cal.addEvent(event_object);
		});
		res.setHeader('Content-Type', 'text/calendar; charset=UTF-8');
		res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');

		return res.send(cal.toString().replace('\n', '\r\n'));
	});
}

module.exports = {
	change_password : function (req, res) {
		var params = req.params;

		if ( params.hasOwnProperty("hash") ) {
			Lectio_sections.find({id : String(params.hash)}).exec(function findCB(find_error, user){
				if (  user.length == 0 ) {
					res.send("Error, no user found!");
				} else {
					Lectio_sections.update({id : String(params.hash)},{password: new Buffer(params.password).toString('base64')}).exec(function(err, users){});
					Lectio_sections.find({id : String(params.hash)}).exec(function findCB(find_error, user){
						if (  user.length == 0 ) {
							res.send("Status can't be checked!");
						} else {
							res.send("Password changed to a password starting with:" + new Buffer(user[0]["password"], 'base64').toString('ascii').substring(0, 3));
						}
					});
				}
			});
		} else {
			res.send("Error!");
		}
	},

	assignments : function (req, res) {
		var params = req.params;

		if ( params.hasOwnProperty("hash") ) {
			Lectio_sections.find({id : String(params.hash)}).exec(function findCB(find_error, user){
				if (  user.length == 0 ) {
					res.send("Error, no user found!");
				} else {
					returnAssignmentCalendar( res, user[0]["user_id"], user[0] );
				}
			});
		} else {
			if ( ! params.section || ! params.branch_id || ! params.branch || ! params.password ) {
				res.send("Error!");
				return;
			}

			Lectio_sections.find({user_id : params.section}).exec(function findCB(find_error, user){
				if (  user.length == 0 ) {
					LectioAuthenticate.authenticate(params.branch, params.branch_id, params.username, params.password, function ( cookies ) {
						if ( ! cookies ) {
							res.send("Error!");
							return;
						} else {
							Lectio_sections.create({school_id: params.branch, branch_id: params.branch_id, user_id: params.section, username: params.username, password: new Buffer(params.password).toString('base64')}).exec(function createCB(createError, createResult) {
								LectioUser.get(params.section, params.branch, function ( userResponse ){
									LectioAssignments.get( params.branch, params.branch_id, params.section, params.username, params.password, function ( success ) {
										res.send(userResponse["id"]);
									} );
								});
							});
						}
					});
				} else {
					if ( ! user.hasOwnProperty("password") ) {
						LectioAuthenticate.authenticate(params.branch, params.branch_id, params.username, params.password, function ( cookies ) {
							if ( ! cookies ) {
								res.send("Error!");
							} else {
								Lectio_sections.update({user_id : params.section},{branch_id: params.branch_id, user_id: params.section, username: params.username, password: new Buffer(params.password).toString('base64')}).exec(function(err, users){});
								user[0].password = params.password;
								user[0].username = params.username;
								user[0].branch_id = params.branch_id;

								LectioAssignments.get( params.branch, params.branch_id, params.section, params.username, params.password, function ( success ) {
									res.send(user[0]["id"]);
								} );
							}
						});
					} else {
						res.send(user[0]["id"]);
					}
				}
			});
		}
	},

	timetable: function (req, res) {
		var params = req.params;

		Lectio_sections.find({user_id : params.section}).exec(function findCB(find_error, user){
			if (  user.length == 0 ) {
				console.log("Fuck it, new user")
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
						LectioTimetable.get(params.branch, params.section, now.format("YYYY"), now.format("ww"), function ( success ) {
							if ( success == true ) {
								returnCalendar(res, params, userResponse);
							} else {
								return res.send(cal.toString().replace('\n', '\r\n'));
							}
						});
					});
				});
			} else {
				console.log("This user already existed")
				returnCalendar( res, params, user[0] );
			}
		});
	},

	daily: function (req, res) {
		var now = moment(Date.now());
		Lectio_sections.find().exec(function findCB(find_error, users){
			users.forEach(function (user, index) {
				var current_week = parseInt(now.format("ww"));
				for (var week = current_week; week <= current_week + 4; week++) {
					if (week <= 52) {
						console.log("Running the shizzle for " + user['school_id'] + "/" + user['user_id'] + " in " + now.format("YYYY") + ":" + String(week));
						LectioTimetable.get(user['school_id'], user['user_id'], now.format("YYYY"), String(week));
					}
				}

				if ( Object(user).hasOwnProperty("password") ) {
					console.log("Fetching User!");
					LectioAssignments.get( user['school_id'], user['branch_id'], user["user_id"], user["username"], new Buffer(user["password"], 'base64').toString('ascii'), function ( status ) {
						if ( status == false ) {
							console.log("Error!");
						} else {
						}
					});
				}
			});
			return res.send("Working on it, bitch!")
		});
	},

	test_proxy: function (req, res) {
		request({
			"url": "https://api.ipify.org/",
			agent: new Socks5ClientHttpsAgent({
		        socksHost: 'localhost', 
		        socksPort: 9050
		    })

		}, function ( error, response, body ) {
			return res.send("IP: " + body + ", possible error: " + error);
		});
	}
};

