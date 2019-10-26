# RaspSpotifyRGB

RaspSpotifyRGB allows you to visualize your music though WS2812B. Using an addressable LED strip, this script gets the dominant colors of the current album playing, data on the beat, volume, timing and other features of the song, and uses this data to synchronize the visuals with the sound.

### Using your own Spotify credentials
You will need to register your app and get your own credentials from the Spotify for Developers Dashboard.

To do so, go to [your Spotify for Developers Dashboard](https://beta.developer.spotify.com/dashboard) and create your application. For the examples, we registered these Redirect URIs:

* http://localhost:8888 (needed for the implicit grant flow)
* http://localhost:8888/callback

Once you have created your app, replace the `client_id`, `redirect_uri` and `client_secret` in the examples with the ones you get from My Applications.

## Running the examples

    $ node app.js

Then, open `http://localhost:8888` in a browser.

## Video

[![Watch the video](https://img.youtube.com/vi/wyn354Rc_MY/maxresdefault.jpg)](https://youtu.be/jNMcFdm7BTY)
[![Watch the video](https://img.youtube.com/vi/_fMq2rnl_FY/maxresdefault.jpg)](https://youtu.be/_fMq2rnl_FY)

