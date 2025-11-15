// importScripts('http://localhost:5173/lib/jszip.min.js');
// importScripts('http://localhost:5173/lib/URLContent.js',
//     'http://localhost:5173/lib/HomeRecorder.js');
import { HomeRecorder } from './HomeRecorder';


onmessage = function (ev) {
    new HomeRecorder(ev.data.recorderConfiguration)
        .generateHomeZip(
            ev.data.homeXmlEntry,
            ev.data.homeContents,
            ev.data.homeContentTypes,
            ev.data.savedContentNames,
            ev.data.dataType, {
            homeSaved: function (homeXmlEntry, data) {
                postMessage(data);
            },
            homeError: function (status, error) {
                postMessage({ status: status, error: error });
            }
        });
};
