import React, { useEffect, useRef, useState } from "react";
import { Image, View, FlatList, StyleSheet } from "react-native";
import { Text, TextInput, Button, ProgressBar } from 'react-native-paper';
import { SafeAreaView } from "react-native-safe-area-context";
import SelectMedia from "../components/SelectMedia";
import MediaBar from "../components/MediaBar";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WS_URL, USERNAME, CHAT_FOLDER, WS_TOKEN_API, WS_TOKEN, WS_TOKEN_EXPIRY, BASE_URL, WS_TOKEN_EXPIRY_KEY, WS_TOKEN_KEY } from './config';
import { File, Paths, Directory } from "expo-file-system";
import { createHash } from 'react-native-quick-crypto';

//  IMPORTANT: adjust this address based on how you run it
// For Android emulator: ws://10.0.2.2:8089/ws
// For same machine (web preview): ws://localhost:8089/ws
// For real device: ws://YOUR_LOCAL_IP:8089/ws

const NotConnected_Reconnect = {
    username: "system",
    event_type: "message",
    payload: "Not connected. Trying to reconnect..."
}

const ConnectedToServer = {
    username: "system",
    event_type: "message",
    payload: "Connected to server."
}

const WebsocketError = {
    username: "system",
    event_type: "message",
    payload: "WebSocket error. See console."
}

const WebsocketDisconnected = {
    username: "system",
    event_type: "message",
    payload: "Disconnected from server."
}

const UnableToVerifyHash = {
    username: "system",
    event_type: "message",
    payload: "Unable to verify file integrity. (No hash)"
}

const FailedToVerifyHash = {
    username: "system",
    event_type: "message",
    payload: "Failed to verify file integrity. (Hash verification failed)"
}

export default function Chat() {
    const ws_upload = useRef(null);
    const ws_download = useRef(null);
    const username = useRef('User' + Math.floor(Math.random() * 100));
    const authToken = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [inputText, setInputText] = useState("");
    const [inputMedia, setInputMedia] = useState([]);
    const [messages, setMessages] = useState([]);
    // Queue of files to send
    const fileQueue = useRef([]);
    // Keep track of files-sent progress
    const bytesSentRef = useRef(0);
    const totalSendBytesRef = useRef(0);
    const [bytesSent, setBytesSent] = useState(0);
    const [totalSendBytes, setTotalSendBytes] = useState(0);
    // Keep track of files-downloaded progress
    const downloadTimeouts = useRef(new Map());
    const bytesDownloadRef = useRef(0);
    const totalDownloadBytesRef = useRef(0);
    const [bytesDownload, setBytesDownload] = useState(0);
    const [totalDownloadBytes, setTotalDownloadBytes] = useState(0);
    // File Reference Download Storage
    const downloads = useRef(new Map());

    const loadUsername = async () => {
        console.log('username key', USERNAME);
        const result = await AsyncStorage.getItem(USERNAME);
        
        // Check that the result was not an error
        if (typeof result == 'string') {
            username.current = result;
            console.log(`Updated Username: ${result}`);
        }
        // Log any errors
        else if (result != null) {
            console.warn(result);
        }
    }

    /**
     * Get or generate authentication token
     */
    const getAuthToken = async () => {
        // Check if we have a valid token stored
        const storedToken = await AsyncStorage.getItem(WS_TOKEN_KEY);
        const expiryStr = await AsyncStorage.getItem(WS_TOKEN_EXPIRY_KEY);

        
        // Check if token is still valid
        if (storedToken && expiryStr) {
            console.log("Token: " + storedToken.substring(0, 8));
            console.log("Expiry: " + expiryStr);
 
            const expiry = Number.parseInt(expiryStr);

            // If token is still valid (with 1 day buffer)
            if (Date.now() < expiry - (24 * 60 * 60 * 1000)) {
                console.log(`Using existing token: ${storedToken.substring(0, 8)}`);
                return storedToken;
            }
        }
        
        // Need to get a new token
        console.log('Requesting new token from server...');
        try {
            const response = await fetch(`${BASE_URL}/ws/auth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username.current
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const newToken = data.token;
            const expiresIn = data.expires_in * 1000; // Convert to milliseconds
            
            // Store token and expiry
            await AsyncStorage.setItem(WS_TOKEN_KEY, newToken);
            await AsyncStorage.setItem(WS_TOKEN_EXPIRY_KEY, (Date.now() + expiresIn).toString());
            
            console.log('Received new token');
            return newToken;
        } catch (error) {
            console.error('Failed to get auth token:', error);
            throw error;
        }
    }

    // Connect to WebSocket when component mounts
    useEffect(() => {
        loadUsername();
        connectWebSocket();

        // Cleanup on unmount
        return () => {
            if (ws_upload.current || ws_download.current) {
                ws_upload.current.close();
                ws_download.current.close();
            }
        };
    }, []);

    const handleDownload = async (event_type, data) => {
        // Sender info
        const sender = data.username;
        // File content data
        const file_name = data.payload.file_name;
        const bytes = data.payload.bytes;
        
        // The mapped key value for this file
        const file_key = `${sender.padEnd(12, ' ').substring(0, 13).trim()}_${file_name}`;
        const file = downloads.current.get(file_key);

        if (file) {
            // Write the next chunk into the buffer
            file.buffer.set(bytes, file.offset);
            file.offset = file.offset + bytes.length;
            file.hash.update(bytes);

            // Add a timestamp to purge incomplete files
            file.lastUpdated = Date.now();

            // Clear OLD timeouts, to prevent buildup
            if (downloadTimeouts.current.has(file_key)) {
                clearTimeout(downloadTimeouts.current.get(file_key));
            }

            // Set NON-BLOCKING timeout to cleanup stale downloads
            // Wait for 15 seconds before removing temporary downloads
            const timeoutId = setTimeout(() => {
                const timeSinceUpdate = Date.now() - file.lastUpdated;
                if (timeSinceUpdate >= 10000) {  // Not updated in last 10 seconds
                    console.warn(`Download timeout for file: ${file_key}`);
                    downloads.current.delete(file_key);
                    downloadTimeouts.current.delete(file_key);
                }
                else {
                    console.warn(`Still downloading file: ${file_key}`);
                }
            }, 15000);
            
            downloadTimeouts.current.set(file_key, timeoutId);
        }

        if (event_type == "file_start") {       // The first chunk
            // Optional values, only from the first file chunk
            const filesize = data.payload.size
            const timestamp = data.payload.timestamp;
            const server_hash = data.payload.hash;
            const algorithm = data.payload.algorithm;
        
            // The file exists already
            if (file && file.hash.digest("hex") === expected_hash) {
                console.warn(`This was already downloaded. File: ${file_key}`);
                return;
            }

            // Initialize a new file
            downloads.current.set(file_key, {
                buffer: new Uint8Array(filesize),  // Allocate once!
                offset: 0,                         // Track write position
                hash: createHash(algorithm),
                expected_hash: server_hash,
                lastUpdated: Date.now(),
                timestamp: timestamp,
                size: filesize,
            });

            // Get the new file-download
            const newDownload = downloads.current.get(file_key);

            // Write first chunk
            newDownload.buffer.set(bytes, newDownload.offset);
            newDownload.offset = bytes.length;
            newDownload.hash.update(bytes);
        }
        else if (file && event_type == "file_end") {    // The last chunk
            // Verify the file hash
            console.log("File successfully received!");

            // Calculate the final hash for the data
            const calculated_hash = file.hash.digest("hex");

            // The calculated hash doesn't match the expected
            if (calculated_hash !== file.expected_hash) {
                console.warn(`
                    Failed to verify hash for file: ${file_key}
                        Expected: \t${file.expected_hash}
                        Got: \t\t${calculated_hash}
                `)

                // Display a 'failed to verify hash' message
                addSystemMessage(FailedToVerifyHash);
                return; // Quit
            }
            
            console.log(`Successfully verified file hash!`);
            console.log(`Preparing to write file: ${file_key} (${file.size} bytes)`)
                
            // The directory to store media
            const directory = new Directory(Paths.document, CHAT_FOLDER)

            // Create the directory if it doesn't exist
            if (!directory.exists) {
                console.log('Created application documents directory.');
                directory.create();
            }

            // Create a file with the given name
            const newFile = new File(directory, file_key);

            // Write the file data
            console.log("Writing received file...");
            newFile.write(file.buffer);
            newFile.bytes().then((b) => console.log(b.length + " Bytes"));
            console.log("Finished.");
            
            // Add the received message to the thread
            //     - Change event from 'file_end' to 'file'
            //     - Change from { filename, bytes } to URI
            addClientMessage('file', newFile.uri, file.timestamp, sender);
            
            console.log(newFile.uri);

            // Quit the function so the last block of code doesn't execute
            return;
        }
    }

    const handleMessage = (data) => {
        // Sender info
        const sender = data.username;
        // Message content data
        const text = data.payload.text;
        const timestamp = data.payload.timestamp;

        // Add the message to the chat 
        addClientMessage('message', text, timestamp, sender);
    }

    const connectWebSocket = async () => {
        // Close previous connection if any
        if (ws_upload.current || ws_download.current) {
            ws_upload.current.close();
            ws_download.current.close();
        }

        // Get authentication token
        const token = await getAuthToken();
        authToken.current = token;

        // Connect with token as query parameter
        console.log("Connecting to WebSocket...");

        ws_upload.current = new WebSocket(`${WS_URL}/upload?token=${token}`);
        ws_download.current = new WebSocket(`${WS_URL}/download?token=${token}`)

        ws_download.current.onopen = () => {
            console.log("Download WebSocket connected");
            // Display connection notice, since can download (receive)
            setIsConnected(true);
            addSystemMessage(ConnectedToServer);
        };

        ws_upload.current.onopen = () => {
            console.log("Upload WebSocket connected");
            // No need to duplicate user-visible connection notices
        }

        ws_download.current.onmessage = (event) => {
            const data = JSON.parse(event.data)
            const event_type = data.event_type;

            if (data) {
                // The websocket is sending a file
                if (event_type.startsWith("file")) {
                    handleDownload(event_type, data);
                }
                else if (event_type.startsWith("message")) {
                    handleMessage(data);
                }
                else {
                    console.warn(`Received: ${data}`);
                }
            }
        };

        // Trouble with error events having no helpful information
        ws_download.current.onerror = () => {}
        ws_upload.current.onerror = () => {}

        // Only catch the download (receive) websocket on close
        // Otherwise would duplicate calls
        // Upload is semi-handled with the sendPayload function
        ws_download.current.onclose = async (event) => {
            console.log("Download WebSocket closed");
            setIsConnected(false);
            addSystemMessage(WebsocketDisconnected);

            console.log(event.code);
            console.log(event.reason);

            // If closed due to invalid token, clear stored token
            if (event.code === 1008 || event.reason?.includes("403")) {
                await AsyncStorage.removeItem(WS_TOKEN_KEY);
                await AsyncStorage.removeItem(WS_TOKEN_EXPIRY_KEY);

                console.log("Attempting to reconnect, regenerating token");

                // Attempt to reconnect
                connectWebSocket();
            }
        };
    };

    /**
     * Add a message sent from the system to the chat
     *   - If message_type is 'file', payload must be the file URI
     *   - If message_type is 'message', payload must be a String
     * @param {Object} data A JSON object { username, event_type, payload }
     */
    const addSystemMessage = (data) => {
        setMessages(messages => 
            [
                ...messages,
                {
                    id: Date.now().toString() + Math.random().toString(),
                    from: data.username,
                    event_type: data.event_type,
                    payload: data.payload,
                },
            ]
        );
    };

    /**
     * Add a message sent from the user to the chat
     *   - If message_type is 'file', payload must be the file URI
     *   - If message_type is 'message', payload must be a String
     * @param {String} message_type The message event type 
     * @param {*} content The message content
     * @param {Number} timestamp When the message was sent
     * @param {String} sender The sender (defaults to client)
     */
    const addClientMessage = (message_type, content, timestamp=Date.now(), sender="me") => {
        // Add the item to the chat
        setMessages(messages => 
            [
                ...messages, 
                {
                    id: Date.now().toString() + Math.random().toString(),
                    from: sender, // Default is client username,
                    timestamp: timestamp,
                    event_type: message_type,
                    payload: content
                }
            ]
        );
    }

    /**
     * Send a single byte-chunk to the websocket 
     * @param {Uint8Array} bytes The file content (in bytes)
     * @returns The remaining (unsent) file content 
     */
    const sendByteChunk = async (filename, bytes, size, md5_hash=null) => {
        const CHUNK_SIZE = 1024 * 64; // 64KB
        const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer limit

        // Check WebSocket buffer size
        const bufferedAmount = ws_upload.current?.bufferedAmount || 0;
        
        // If buffer is too full, wait for it to drain
        if (bufferedAmount > MAX_BUFFER_SIZE) {
            console.log("BUFFER MAX");
            await new Promise(resolve => setTimeout(resolve, 10));
            // Return the unchanged content
            return bytes;
        }

        // The byte-chunk to send
        const chunk = bytes.slice(0, CHUNK_SIZE);

        // The data payload to be sent
        const payload = {
            file_name: filename,
            bytes: Array.from(chunk)
        }
        
        let event_type = "file"; // Default event type

        // This is the first chunk
        if (size === bytes.length) {
            event_type = "file_start"
        }
        // Only one chunk is left to send
        else if (bytes.length <= CHUNK_SIZE) {
            event_type = "file_end";

            // The hash was provided with the file
            if (md5_hash) {
                payload.hash = md5_hash;
                payload.algorithm = "md5";
            }
        }

        // Send the chunk to the websocket
        await sendPayload(event_type, payload);

        // Increment synchronously using ref
        bytesSentRef.current += chunk.length; // Use actual chunk length, not CHUNK_SIZE
        
        // Update state for UI
        setBytesSent(bytesSentRef.current);

        // Return the remaining content
        return bytes.subarray(CHUNK_SIZE);
    }

    /**
     * Sends each queued file, broken into chunks
     */
    const sendQueuedFiles = async () => {
        // There are no files to send
        if (!fileQueue.current || fileQueue.current.length == 0) {
            // Clear the upload progress
            totalSendBytesRef.current = 0;
            bytesSentRef.current = 0;
            setTotalSendBytes(0);
            setBytesSent(0);
            return; // Quit
        }

        // Get the first file
        const file = fileQueue.current.shift();

        // Get the file content (bytes)
        let bytes = await file.bytes();
        let lastUIUpdate = Date.now(); // Track UI Updates
        // Send the file until there is no content to send
        while (bytes.length > 0) {
            // Attempt to send the next byte chunk
            bytes = await sendByteChunk(file.name, bytes, file.size, file.md5);
            
            // // Small delay to allow UI updates
            const now = Date.now();
            // Throttled UI updates (every 100ms)
            if (now - lastUIUpdate > 20) {
                console.log("Updated UI");
                setBytesSent(bytesSentRef.current);
                lastUIUpdate = now;
                await new Promise(r => setTimeout(r, 0)); // Yield
            }
        }

        // Add the sent file to messages
        addClientMessage("file", file.uri);

        // Remove this file from the input media
        setInputMedia(media => media.filter(uri => file.uri !== uri));

        // Send the next file
        sendQueuedFiles();
    }

    /**
     * (Recursive)
     * Queue a list of file paths to be sent to the websocket
     * @param  {...any} fileUris List of file paths to queue
     */
    const addFilesToQueue = async (...fileUris) => {
        // Base case: no more files
        if (fileUris.length === 0) {
            return;
        }
        
        // Get the first file
        const file = new File(fileUris.pop());
        
        // Increment the total byte count synchronously
        totalSendBytesRef.current += file.size;
        
        // Add the File to the file Queue
        fileQueue.current.push(file);
        
        // Recursively process remaining files
        await addFilesToQueue(...fileUris);
    }

    const sendMessage = async () => {
        // MUST FIX TO NOT QUEUE MULTIPLE SENDS
        // OTHERWISE FUCKED UP INSANE DUPLICATION

        // Send attached files if any
        if (inputMedia.length > 0) {
            // Reset counters before starting
            totalSendBytesRef.current = 0;
            bytesSentRef.current = 0;
            setBytesSent(0);
            
            // Add the files to the queue (and calculate total bytes)
            await addFilesToQueue(...inputMedia);
            
            // Update state for UI with total
            setTotalSendBytes(totalSendBytesRef.current);
            
            // Send the queued files
            await sendQueuedFiles();
        }

        // A text message is queued
        if (inputText.trim()) {
            const textToSend = inputText.trim();

            // Send the text message
            await sendPayload("message", { text: textToSend });
            setInputText("");

            // Add the item to the chat
            addClientMessage("message", textToSend);
        }
    };

    const sendPayload = async (event_type, payload) => {
        // The websocket is open
        if (ws_upload.current && ws_upload.current.readyState === WebSocket.OPEN) {
            const data = { // The data to send
                username: username.current,
                event_type: event_type,
                payload: payload
            }
    
            console.log("Created JSON Data");

            // Send the data
            ws_upload.current.send(JSON.stringify(data));
        }
        else {
            // The websocket is null or closed
            if (!ws_upload.current || ws_upload.current.readyState === WebSocket.CLOSED) {
                // Log the disconnect
                addSystemMessage(NotConnected_Reconnect);
                // Reconnect to the websocket
                await connectWebSocket();
            }
            // Any other websocket states should wait to be resolved as either CLOSED or OPEN
            // Wait for a short delay, then try again
            await new Promise(resolve => setTimeout(resolve, 10));
            return sendPayload(event_type, payload);
        }
    }

    const addMediaInput = (media) => {
        // Ignore media that was already added
        if (inputMedia.includes(media)) return;

        // Add 'file://' URI header
        // if (!media.startsWith('file://')) media = `${media + ''.}`;

        // Add the photo to the media list
        setInputMedia((inputList) => [ ...inputList, media ]);
        console.log("Added Item");
    }

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.status}>
                Status: {isConnected ? "😃 Connected" : "😔 Disconnected"}
            </Text>

            <View style={styles.messagesContainer}>
                <ProgressBar visible={totalDownloadBytes > 0} progess={bytesDownload / totalDownloadBytes} />
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <View
                            style={[
                                styles.messageBubble,
                                item.from === "me"
                                    ? styles.myMessage
                                : item.from === "server"
                                    ? styles.serverMessage
                                : item.from === "system"
                                    ? styles.systemMessage
                                : styles.userMessage
                            ]}
                        >
                            <Text variant="bodySmall" style={styles.messageFrom}>{item.from.toUpperCase()}:</Text>
                            {/* Display Message Events as Text Components */}
                            { item.event_type == "message" && <Text variant="bodyLarge" style={styles.messageText}>{item.payload}</Text> }
                            
                            {/* Display File Events as Images (or video) */}
                            { item.event_type == "file" && <Image source={{ uri: item.payload }} style={{ width: 120, height: 120 }}/> }
                        </View>
                    )}
                />
            </View>

            <View style={styles.buttonRow}>
                <MediaBar 
                    media={inputMedia}
                    isSending={totalSendBytes > 0 && bytesSent < totalSendBytes}
                    uploadProgress={totalSendBytes > 0 ? bytesSent / totalSendBytes : 0}
                    thumbnailSize={120}
                    removeItem={(removed) => {
                        // Update the input
                        // Filter all except the removed item
                        setInputMedia((input) => input.filter(media => media !== removed));
                        console.log("Removed Item");
                    }}
                />
            </View>

            <View style={styles.inputRow}>
                <SelectMedia
                    saveMedia={true}
                    limit={4}

                    photoSelected={addMediaInput}
                    
                    photoTaken={addMediaInput}
                />
                
                <TextInput
                    label="Message"
                    style={styles.input}
                    placeholder="Type a message..."
                    value={inputText}
                    onChangeText={(t) => setInputText(text => t)}
                    onSubmitEditing={sendMessage}
                />
                <Button mode="contained" onPress={sendMessage}>Send</Button>
            </View>

            <View style={styles.buttonRow}>
                <Button mode="outlined" onPress={connectWebSocket}>Reconnect</Button>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: -8,
        backgroundColor: "#f0f4ff",
    },
    title: {
        fontSize: 16,
        fontWeight: "800",
        marginBottom: 4,
        textAlign: "center",
    },
    status: {
        fontSize: 14,
        textAlign: "center",
        marginBottom: 8,
    },
    messagesContainer: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        padding: 8,
        backgroundColor: "#ffffff",
    },
    messageBubble: {
        marginVertical: 4,
        padding: 6,
        borderRadius: 6,
    },
    myMessage: {
        alignSelf: "flex-end",
        backgroundColor: "#d4f8d4",
    },
    serverMessage: {
        alignSelf: "center",
        backgroundColor: "#d4e4ff",
    },
    systemMessage: {
        alignSelf: "center",
        backgroundColor: "#fce5cd",
    },
    userMessage: {
        alignSelf: "flex-start",
        backgroundColor: "#fccddcff",
    },
    messageFrom: {
        fontSize: 10,
        opacity: 0.6,
    },
    messageText: {
        fontSize: 14,
    },
    inputRow: {
        flexDirection: "row",
        marginTop: 8,
        alignItems: "center",
        gap: 8,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#aaa",
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: "#ffffff",
    },
    buttonRow: {
        marginTop: 8,
    },
});
