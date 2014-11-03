var cheerio = require('cheerio');
var request = require('request');
var regex = require('named-regexp').named;

module.exports = {
	construct_url : function ( user_id, school_id ) {
		return "https://www.lectio.dk/lectio/" + school_id + "/SkemaNy.aspx?type=elev&elevid=" + user_id
	},

	get : function ( user_id, school_id, callback ) {
		var url = LectioUser.construct_url(user_id, school_id);
		request({
			"url": url
		}, function ( error, response, body ) {
			if ( ! error && response.statusCode == 200 ) {
				LectioUser.parse_data(body, user_id, school_id, callback);
			} else {
				console.log("User Import Error");
				// Error...
			}
		});
	},

	parse_data : function (body, user_id, school_id, callback) {
		$ = cheerio.load(body);

		// If this table doesn't exist, an error occured while recieving data
		if ( $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").length < 1 ) {
			callback(false);
			console.log(" Wrong data! ");

			return false;
		}

		var user_regex = regex(/(:<user_type>\S*) (:<name>.*), (:<class>.*) - (:<type>.*)/ig);
		var user = user_regex.exec($("#s_m_HeaderContent_MainTitle").text().trim());

		var user_type_string = "other";

		switch ( user.capture("user_type") ) {
			case "Eleven":
				user_type_string = "student";
			break;

			case "Læreren":
				user_type_string = "teacher";
			break;
		}

		var user_insert_object = {
			"name" : user.capture("name"),
			"user_type" : user_type_string
		};

		Lectio_sections.update(
			{
				"user_id" : user_id,
				"school_id" : school_id
			}, user_insert_object
		).exec( function updateCB (res) {
			if ( typeof callback == "function" ) {
				callback(user_insert_object);
			}
		} );
	}
}