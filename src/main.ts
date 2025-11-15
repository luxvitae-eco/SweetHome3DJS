import '@flyskypie/j4ts-awtgeom';
import '@flyskypie/j4ts-batik-svgpathparser';
import '@flyskypie/j4ts-swingundo';

import { SweetHome3DJSApplication } from "./SweetHome3DJSApplication.js";

import './style.css';

var urlBase = window.location.href.substring(
    0,
    window.location.href.lastIndexOf("/") + 1
);
var application = new SweetHome3DJSApplication({
    readHomeURL: urlBase + "data/%s.sh3x",
    writeHomeURL: urlBase + "writeData.php?path=%s.sh3x",
    writeResourceURL: urlBase + "writeData.php?path=%s",
    readResourceURL: urlBase + "data/%s",
    listHomesURL: urlBase + "listHomes.php",
    deleteHomeURL: urlBase + "deleteHome.php?home=%s",
    writePreferencesURL:
        urlBase + "writeData.php?path=userPreferences.json",
    readPreferencesURL: urlBase + "data/userPreferences.json",
    furnitureCatalogURLs: [
        urlBase + "lib/resources/DefaultFurnitureCatalog.json",
    ],
    furnitureResourcesURLBase: urlBase,
    texturesCatalogURLs: [
        urlBase + "lib/resources/DefaultTexturesCatalog.json",
    ],
    texturesResourcesURLBase: urlBase,
    writeHomeWithWorker: true,
    compressionLevel: 5,
    autoRecovery: true,
    defaultHomeName: "home-d78b0c75-7b64-4a70-a722-37c8dd6a2b81",
});

setTimeout(function () {
    application.addHome(application.createHome());
});
