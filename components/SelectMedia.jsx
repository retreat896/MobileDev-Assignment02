import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from 'expo-media-library';
import { Menu, IconButton } from "react-native-paper";
import 'react-native-vector-icons';
import { useState } from "react";

const DEBUG = true;

const SelectMedia = ({ limit, saveMedia, photoTaken, photoSelected }) => {
    // Permissions
    const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
    const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
    const [savePermission, requestSavePermission] = MediaLibrary.usePermissions();

    // The maximum number of media items selected
    limit = Math.max(1, limit || 1);
 
    // Menu Display
    const [visible, setVisible] = useState(false);
    // Menu Management
    const openMenu = () => { if (DEBUG) console.log("Opened"); setVisible(true); }
    const closeMenu = () => { if (DEBUG) console.log("Closed"); setVisible(false); }
    
    const saveMediaToLibrary = async (uri) => {
        // No permission to save media
        if (!savePermission) {
            const granted = await requestSavePermission();
            
            // Don't save media, if no permission
            if (!granted) return;
        }
        
        if (DEBUG) console.log(`Saving Media: ${uri}`);

        // Save media to device
        await MediaLibrary.saveToLibraryAsync(uri)
    }

    const launchCamera = async () => {
        closeMenu();

        // No camera permission
        if (!cameraPermission) {
            const granted = await requestCameraPermission();

            console.log(granted);

            // Don't launch camera if no permission
            if (!granted) return;
        }

        const options = {
            mediaType: 'photo',
            quality: 1
        }

        const result = await ImagePicker.launchCameraAsync(options);

        if (result.canceled) {
            if (DEBUG) console.log("User cancelled camera picker");
        }
        else if (result.code) {
            console.error(`Camera Error:  ${result.exception}\n${result.message}`);
        }
        else {
            if (DEBUG) console.log(`Photos Taken: ${result.assets.length}`);

            // Handle each photo
            for (let photo of result.assets) {
                // Save the photo to the device (just because ik that's what Discord does)
                if (saveMedia) await saveMediaToLibrary(photo.uri);
                // Call the callback function
                photoTaken(photo.uri);
            }
        }
    }

    const launchImageLibrary = async () => {
        closeMenu();

        // No library permission
        if (!libraryPermission) {
            // Request library permissions
            const granted = await requestLibraryPermission();

            console.log(granted);
            
            // Don't launch library if no permission
            if (!granted) return;
        }

        const options = {
            allowsMultipleSelection: limit > 1,
            mediaType: 'photo', 
            quality: 1,
            selectionLimit: limit
        }

        console.log

        const result = await ImagePicker.launchImageLibraryAsync(options);

        if (result.canceled) {
            if (DEBUG) console.log('User cancelled image library picker');
        }
        else if (result.code) {
            console.error(`Image Library Error:  ${result.exception}\n${result.message}`);
        }
        else {
            if (DEBUG) console.log(`Photos Selected: ${result.assets.length}`);

            // Handle all selected photos
            for (let photo of result.assets) {
                photoSelected(photo.uri);
            }
        }
    }

    return (
        <Menu
            visible={visible}
            onDismiss={visible ? closeMenu : openMenu}
            anchor={
                <IconButton
                    icon={visible ? "minus" : "plus"}
                    mode="contained"
                    onPress={visible ? closeMenu : openMenu}
                />
            }
            statusBarHeight={-75}
        >
            <Menu.Item 
                onPress={launchCamera} 
                leadingIcon="camera"
                title="Take Photo" 
            />
            <Menu.Item 
                onPress={launchImageLibrary} 
                leadingIcon="image-multiple"
                title="Choose from Library" 
            />
        </Menu>
    )
}

export default SelectMedia;