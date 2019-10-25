
var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var progression = 0
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var ColorThief = require('colorthief');
var ws281x = require('rpi-ws281x-native');


const Clarifai = require('clarifai')
const clarif = new Clarifai.App({
    apiKey: '[*Clarify key*]'
});
var client_id = '[*Spotify API Client ID*]'; // Your client id
var client_secret = '[*Spotify API Secret*]'; // Your secret
var redirect_uri = 'http://localhost:8880/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
    .use(cors())
    .use(cookieParser());

app.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email user-read-currently-playing user-read-playback-state';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});

app.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {

                var access_token = body.access_token,
                    refresh_token = body.refresh_token;

                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: {
                        'Authorization': 'Bearer ' + access_token
                    },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    console.log();
                    //console.log(access_token);
                    //console.log(refresh_token);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

app.get('/refresh_token', function(req, res) {
    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});



app.get('/get-current-song', function(req, res) {
    var access_token = req.query.access_token;
    var authOptions = {
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
        headers: {
            'Authorization': 'Bearer ' + access_token,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    request.get(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            obj = JSON.parse(body)

            var current_song = obj["item"]["name"]
            var artwork = obj["item"]["album"]["images"][0]["url"]
            var song_id = obj["item"]["id"]

            res.send({
                'current_song': current_song,
                'artwork': artwork,
                'status': true,
                'song_id': song_id
            });
        } else {
            res.send({
                'current_song': current_song,
                'artwork': artwork,
                'status': false
            });
            console.log("error getting artwork: " + error)
        }
    });
});


app.get('/song-data', function(req, res) {
    var access_token = req.query.access_token;
    var song_id = req.query.song_id;
    console.log("Getting song data for: " + song_id)
    var authOptions = {
        url: 'https://api.spotify.com/v1/audio-features/' + song_id,
        headers: {
            'Authorization': 'Bearer ' + access_token
            //            'Accept': 'application/json',
            //            'Content-Type': 'application/json'
        }
    };

    request.get(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            obj = JSON.parse(body)

            res.send({
                'song_data': obj,
                'status': true
            });
        } else {
            res.send({

                'status': false
            });
            console.log("Error getting song data: " + error)
        }
    });
});


app.get('/get-dominant-colors', function(req, res) {
    var image = req.query.image;
    //console.log("Recieved image "+image);
    clarif.models.predict("eeed0b6733a644cea07cf4c60f87ebb7", image).then(
        function(response) {
            var dataresponse = response;
            var palette = dataresponse["outputs"][0]["data"]["colors"] //array
            // console.log(palette)
            console.log("performing bubble sort on " + image);
            for (var i = 0; i < palette.length; i++) {

                var tempvalue = palette[i]["value"];
                var tempvalue2 = 0
                var reference

                // console.log()
                // console.log("comparing: ")
                //console.log(tempvalue)
                if (palette.length > 1) {
                    for (x = i + 1; x < palette.length; x++) {
                        //console.log("to "+palette[x]["value"])
                        if (palette[x]["value"] > tempvalue2) {
                            tempvalue2 = palette[x]["value"]
                            reference = x
                        }
                    }
                } else {
                    reference = 0
                }
                //console.log("highest value "+palette[reference]["value"])

                if (palette[reference]["value"] > tempvalue) {
                    var pal1 = palette[i]
                    var pal2 = palette[reference]
                    palette[reference] = pal1
                    palette[i] = pal2
                }
            }
            res.send({
                'response': palette,
            });
            //console.log();
            //console.log(palette) //sorted palette

            //console.log();
        },
        function(err) {
            // there was an error
            console.log(err)
        }
    );

});


app.get('/analysis', function(req, res) {
    var access_token = req.query.access_token;
    var song_id = req.query.song_id;
    console.log("Getting analysis of: " + song_id)
    var authOptions = {
        url: 'https://api.spotify.com/v1/audio-analysis/' + song_id,
        headers: {
            'Authorization': 'Bearer ' + access_token
            //            'Accept': 'application/json',
            //            'Content-Type': 'application/json'
        }
    };

    request.get(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            obj = JSON.parse(body)
            //console.log(obj["beats"])
            res.send({
                'features': obj,
                'status': true
            });
        } else {
            res.send({

                'status': false
            });
            console.log("Error getting analysis: " + error)
        }
    });
});


app.get('/playback', function(req, res) {
    var access_token = req.query.access_token;
    //console.log("Getting playback status: ")
    //console.log()
    var authOptions = {
        url: 'https://api.spotify.com/v1/me/player',
        time: true,
        headers: {
            'Authorization': 'Bearer ' + access_token
            //            'Accept': 'application/json',
            //            'Content-Type': 'application/json'
        }
    };

    request.get(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            obj = JSON.parse(body)
            //console.log("timestamp: "+obj["timestamp"])
            //console.log("progress ms: " +obj["progress_ms"])
            progression = obj["progress_ms"]
            if (!obj["is_playing"]) {

            }
            res.send({
                'playback': obj,
                'responsetime': response.elapsedTime,
                'status': true
            });
        } else {
            res.send({

                'status': false
            });
            console.log("Error getting playback: " + error)
        }
    });
});



app.get('/changeLedInRange', function(req, res) {

    var from = req.query.from;
    var to = req.query.to;
    var red1 = req.query.red;
    var green1 = req.query.green;
    var blue1 = req.query.blue;
    var brightness = req.query.brightness;

    var raspurl = 'http://___._IP or raspi.___.___:8083/changeLedInRange'
    var propertiesObject = {
        from: '1',
        to: '149',
        red: red1,
        green: green1,
        blue: blue1,
        brightness: '100'
    };


    request.get({
        url: raspurl,
        qs: propertiesObject
    }, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            res.send({

                'data': body
            });
        };

    });

});


function hexToRgb(hex) {
    return ['0x' + hex[1] + hex[2] | 0, '0x' + hex[3] + hex[4] | 0, '0x' + hex[5] + hex[6] | 0];
}


app.get('/newsong', function(req, res) {
        var access_token = req.query.access_token;
        var song_id = req.query.song_id; //analisis (beats) and (audiofeatures)
        var image = req.query.image; //dominant colors
        console.log("New song request")
        console.log()
        console.log(access_token)
        console.log(song_id)
        console.log(image)
        console.log()
        //variables
        var palette;
        var beats;
        var features;
        var palettewait = false;
        var beatswait = false;
        var featureswait = false;


        //dmoninant colors
        clarif.models.predict("Clarify key", image).then(
            function(response) {

                var dataresponse = response;
                palette = dataresponse["outputs"][0]["data"]["colors"] //array
                //bubble sort
                for (var i = 0; i < palette.length; i++) {

                    var tempvalue = palette[i]["value"];
                    var tempvalue2 = 0
                    var reference

                    // console.log()
                    // console.log("comparing: ")
                    //console.log(tempvalue)
                    if (palette.length > 1) {
                        for (x = i + 1; x < palette.length; x++) {
                            //console.log("to "+palette[x]["value"])
                            if (palette[x]["value"] > tempvalue2) {
                                tempvalue2 = palette[x]["value"]
                                reference = x
                            }
                        }
                    } else {
                        reference = 0
                    }
                    //console.log("highest value "+palette[reference]["value"])

                    if (palette[reference]["value"] > tempvalue) {
                        var pal1 = palette[i]
                        var pal2 = palette[reference]
                        palette[reference] = pal1
                        palette[i] = pal2
                        palettewait = true
                        //console.log(palette)//works
                    }

                }
            }
        );
        //beats
        var authOptionsbeats = {
            url: 'https://api.spotify.com/v1/audio-analysis/' + song_id,
            headers: {
                'Authorization': 'Bearer ' + access_token
            }
        };
        request.get(authOptionsbeats, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                obj = JSON.parse(body)
                beats = obj
                beatswait = true;
                //console.log(beats)//works
            }
        });



        //songfeatures
        var authOptionsfeatures = {
            url: 'https://api.spotify.com/v1/audio-features/' + song_id,
            headers: {
                'Authorization': 'Bearer ' + access_token
            }
        };

        request.get(authOptionsfeatures, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                obj = JSON.parse(body)
                features = obj
                featureswait = true
                //console.log(features)//works
            };

        });



        //reply



        var interval = setInterval(function() {
            if (!palettewait && !featureswait && !beatswait) {


                console.log("waiting")
            } else {



                //    beatsled(palette,beats,features)
                res.send({
                    'palette': palette,
                    'beats': beats,
                    'features': features

                });


                //console.log(palette) //sorted palette




                //console.log(beats)
                //console.log(features)
                clearInterval(interval);
            }

        }, 1000);


    },
    function(err) {
        console.log(err)
    }
);
var secondcounter = 0
var looper

function beatsled(palette, beats, features) {

    var beatcounter = 5
    var caughtup = false
    var l = 0
    clearTimeout(looper)


    var x = 1; //ms time

    var incrementFunction = function() {

        progression = progression + 1
        beatsformat = progression / 1000
        beatsformat = beatsformat.toFixed(3)
        beatstime = beats["beats"][beatcounter]["start"].toFixed(3)
        beatstimenext = beats["beats"][beatcounter + 1]["start"].toFixed(3)
        if (beatcounter > 3) {
            beatstimelast = beats["beats"][beatcounter - 1]["start"].toFixed(3)
        } else {
            beatstimelast = beats["beats"][beatcounter - 1]["start"].toFixed(3)
        }
        beatsarray = beats["beats"]

        // console.log(beatcounter)

        if (beatcounter > 3) {
            if (beatstime < beatsformat) {
                console.log("skipped")
                caughtup = false
                beatcounter = 0
            }
            // if(beatstimelast>beatsformat){
            //
            //   console.log("rewinded")
            //   caughtup=false
            // beatcounter=0
            // }
        }
        if (!caughtup) {

            // console.log()
            // console.log("last beat "+ beatstimelast)
            // console.log("Current beat "+ beatstime)
            // console.log("next beat "+ beatstimenext)
            // console.log("progress "+ beatsformat)

            catchuptime = 0
            catchupbeatcounter = 0
            while (catchuptime < beatsformat && !caughtup) {
                catchuptime = catchuptime + beats["beats"][catchupbeatcounter]["duration"]
                catchupbeatcounter = catchupbeatcounter + 1

            }
            progression = catchuptime * 1000

            console.log("Caught up to: " + millisToMinutesAndSeconds(progression) + " at beat: " + catchupbeatcounter)

            beatcounter = catchupbeatcounter
            console.log(beatcounter)

            caughtup = true
        }
        if (beatstime == beatsformat) {
            console.log('\x1b[36m%s\x1b[0m', "Beat #: " + beatcounter + " at: " + millisToMinutesAndSeconds(beatstime))

            try {

                //var changeasync = setTimeout(function(){

                //clearTimeout(changeasync)
                //}, 3000);
                if (l < palette.length - 1) {
                    l = l + 1
                } else(
                    l = 0
                )
            } catch (e) {
                console.log(e)
            }
            beatcounter = beatcounter + 1
        }


        if (secondcounter == 1000) {

            console.log(millisToMinutesAndSeconds(progression))
            secondcounter = 0
        }
        secondcounter = secondcounter + 1
        looper = setTimeout(incrementFunction, x);
    };
    incrementFunction();



}

function millisToMinutesAndSeconds(millis) {
    var milliseconds = millis % 100
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds + ":" + parseInt(milliseconds);
}



const defaultBrightness = 100;
const redColor = rgb2Int(255, 0, 0);
var ledIdInit = 0;
var initTimes = 4 * 8;
var app = express();

var NUM_LEDS = parseInt(process.argv[2], 10) || 8,
    pixelData = new Uint32Array(NUM_LEDS);

ws281x.init(NUM_LEDS);

// ---- trap the SIGINT and reset before exit
process.on('SIGINT', function() {
    ws281x.reset();
    process.nextTick(function() {
        process.exit(0);
    });
});

app.get('/switchAllOff', function(req, res) {
    switchAllLedOff();
    res.type("application/json");
    res.send('{"status":"ok"}');
});

app.get('/changeLedInRange', function(req, res) {
    var from = parseInt(req.query.from);
    var to = parseInt(req.query.to);
    var red = req.query.red;
    var green = req.query.green;
    var blue = req.query.blue;
    var brightness = parseInt(req.query.brightness);
    var tempadder = Number(red) + Number(green) + Number(blue)

    console.log(red + "," + green + "," + blue + "," + brightness)
    if (
        (from === undefined || from < 0 || from > NUM_LEDS - 1) ||
        (to === undefined || to < 0 || to > NUM_LEDS - 1) ||
        (from >= to) ||
        (red === undefined || red < 0 || red > 255) ||
        (green === undefined || green < 0 || green > 255) ||
        (blue === undefined || blue < 0 || blue > 255) ||
        (brightness === undefined || brightness < 0 || brightness > 100)) {
        res.send("{}");
        return;
    }

    ws281x.setBrightness(brightness);
    for (var ledId = from; ledId <= to; ledId++) {
        // if(ledId>70 && ledId<73){
        //
        // }
        // else{
        var color = rgb2Int(red, green, blue);
        pixelData[ledId] = color;
        //}
    }
    ws281x.render(pixelData);
    res.type("application/json");
    res.send('{"status": "ok"}');
    return;
});


app.get('/changeLedInRangeshot', function(req, res) {
    console.log(req.query)
    var from = parseInt(req.query.from);
    var to = parseInt(req.query.to);
    var red = req.query.red;
    var green = req.query.green;
    var blue = req.query.blue;
    var brightness = parseInt(req.query.brightness);
    if (
        (from === undefined || from < 0 || from > NUM_LEDS - 1) ||
        (to === undefined || to < 0 || to > NUM_LEDS - 1) ||
        (from >= to) ||
        (red === undefined || red < 0 || red > 255) ||
        (green === undefined || green < 0 || green > 255) ||
        (blue === undefined || blue < 0 || blue > 255) ||
        (brightness === undefined || brightness < 0 || brightness > 100)) {
        res.send("{}");
        return;
    }

    ws281x.setBrightness(brightness);
    for (var ledId = from; ledId <= to; ledId++) {

        var color = rgb2Int(red, green, blue);
        pixelData[ledId] = color;
        ws281x.render(pixelData);

        if (ledId - 6 > from) {
            var color = rgb2Int(0, 0, 0);
            pixelData[ledId - 5] = color;
            ws281x.render(pixelData);
        }
    }

    res.type("application/json");
    res.send('{"status": "ok"}');
    return;
});


app.get('/changeLed', function(req, res) {
    var ledId = parseInt(req.query.ledId);
    var red = req.query.red;
    var green = req.query.green;
    var blue = req.query.blue;
    var brightness = parseInt(req.query.brightness);
    if ((ledId === undefined || ledId < 0 || ledId > NUM_LEDS - 1) ||
        (red === undefined || red < 0 || red > 255) ||
        (green === undefined || green < 0 || green > 255) ||
        (blue === undefined || blue < 0 || blue > 255) ||
        (brightness === undefined || brightness < 0 || brightness > 100)) {
        res.send("{}");
        return;
    }

    var conf = new Object();
    conf.ledId = ledId;
    conf.color = rgb2Int(red, green, blue);
    conf.brightness = brightness;
    console.log("LedId " + ledId);
    console.log("Color " + red + ";" + green + ";" + blue);
    console.log("Brightness " + brightness);
    res.type("application/json");
    res.send(JSON.stringify(conf));
    changeLed(ledId, conf.color, conf.brightness);
    return;
});



app.get('/stoprainbow', function(req, res) {
    stoprainbow()
    res.type("application/json");
    res.send("{Stop Rainbow}");
    return;
});

app.get('/rainbow', function(req, res) {
    rainbow()
    res.type("application/json");
    res.send("{Rainbow}");
    return;
});

defBrightness();

function defBrightness() {
    ws281x.setBrightness(100);
}

setTimeout(startupSequence, 20);

function startupSequence() {

    switchAllLedOff();
    changeLed(7, redColor, 20);


}

function changeLed(ledId, color, brightness) {
    ws281x.setBrightness(brightness);
    pixelData[ledId] = color;
    ws281x.render(pixelData);
}


function switchAllLedOff() {
    stoprainbow()
    ws281x.setBrightness(0);
    var noColor = rgb2Int(0, 0, 0);
    for (var i = 0; i < NUM_LEDS; i++) {
        pixelData[i] = noColor;
    }

    ws281x.render(pixelData);
}




function rgb2Int(r, g, b) {
    return ((r & 0xff) << 16) + ((g & 0xff) << 8) + (b & 0xff);
}

var rainbow1 = false
var rainbowinterval

function rainbow() {
    defBrightness()
    var offset = 0;
    var coutner = 0
    if (rainbow1) {
        //stoprainbow()

    } else {
        rainbow1 = true
        rainbowinterval = setInterval(function() {
            if (!rainbow1) {
                stoprainbow()
            }
            for (var i = 0; i < NUM_LEDS; i++) {
                pixelData[i] = colorwheel((offset + i) % 256);
            }


            offset = (offset + 1) % 256;
            ws281x.render(pixelData);
        }, 1000 / 30);
    }
}


function stoprainbow() {
    rainbow1 = false
    clearInterval(rainbowinterval);
}
// rainbow-colors, taken from http://goo.gl/Cs3H0v
function colorwheel(pos) {
    pos = 255 - pos;
    if (pos < 85) {
        return rgb2Int(255 - pos * 3, 0, pos * 3);
    } else if (pos < 170) {
        pos -= 85;
        return rgb2Int(0, pos * 3, 255 - pos * 3);
    } else {
        pos -= 170;
        return rgb2Int(pos * 3, 255 - pos * 3, 0);
    }
}

function rgb2Int(r, g, b) {
    return ((r & 0xff) << 16) + ((g & 0xff) << 8) + (b & 0xff);
}




console.log('Listening on 8083');
app.listen(8083);