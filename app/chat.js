import React, { useEffect, useRef, useState } from "react";
import { Image, View, FlatList, StyleSheet } from "react-native";
import { Text, TextInput, Button } from 'react-native-paper';
import { SafeAreaView } from "react-native-safe-area-context";
import SelectMedia from "../components/SelectMedia";
import MediaBar from "../components/MediaBar";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WS_URL, USERNAME, CHAT_FOLDER } from './config';
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
    const ws = useRef(null);
    const username = useRef('User' + Math.floor(Math.random() * 100));
    const [isConnected, setIsConnected] = useState(false);
    const [inputText, setInputText] = useState("");
    const [inputMedia, setInputMedia] = useState([]);
    const [messages, setMessages] = useState([]); // {id, from, text}
    // File Steam Temp Storage
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

    // Connect to WebSocket when component mounts
    useEffect(() => {
        loadUsername();
        connectWebSocket();

        // Cleanup on unmount
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    const handleReceiveFile = (data) => {
        // console.log(data.payload);

        // Get the file being downloaded
        const filename = data.payload.filename;
        const file = downloads.current.get(filename);
        // The received bytes
        const bytes = data.payload.bytes;

        // Websocket indicated a file is being sent
        if (data.event_type === "file_start") {
            
            // The file was already downloaded, and verified
            if (file && file.hash.digest("hex") === file.expected_hash) {
                console.warn(`That's strange. This was already downloaded. File: ${filename}`);
                return;
            }
            
            console.log(`Started listening for file: ${filename}`);

            // Create the data for the downloading file
            downloads.current.set(filename, {
                data: new Uint8Array(),                    // Create new bytes buffer 
                hash: createHash(data.payload.algorithm),   // Initialize the hash
                expected_hash: data.payload.hash            // Store the expected hash
            })
        }
        // This isn't the first chunk being sent
        else if (bytes) { // Ensure bytes is not undefined
            console.log(`Received ${bytes.length} bytes.`);
            
            // Extend the bytes array
            file.data = new Uint8Array([...new Uint8Array(file.data), ...bytes]);
            
            // Update the hash
            file.hash.update(bytes);
        }
        else {
            console.warn(`That's strange. No bytes were sent with the chunk. File: ${filename}`);
        }

        // The file isn't complete, so exit the function
        if (data.event_type !== "file_end") return;

        console.log("File successfully received!");

        // Calculate the final hash for the data
        const calculated_hash = file.hash.digest("hex");

        // The calculated hash doesn't match the expected
        if (calculated_hash !== file.expected_hash) {
            console.warn(`
                Failed to verify hash for file: ${filename}
                    Expected: \t${file.expected_hash}
                    Got: \t\t${calculated_hash}
            `)

            // Display a 'failed to verify hash' message
            addMessage(FailedToVerifyHash);
        }
        // Hash verified succesfully
        else {
            console.log(`Successfully verified file hash!`);
            console.log(`Preparing to write file: ${filename}`)
            
            // The directory to store media
            const directory = new Directory(Paths.document, CHAT_FOLDER)

            // Create the directory if it doesn't exist
            if (!directory.exists) {
                console.log('Created application documents directory.');
                directory.create();
            }

            // Create a new file with the given name
            const newFile = new File(directory, filename);

            // Write the file data
            console.log("Writing received file...");
            newFile.write(new Uint8Array(file.data));
            newFile.bytes().then((b) => console.log(b.length + " Bytes"));
            console.log("Finished.");
            
            // Add the received message to the thread
            addMessage({
                ...data,
                event_type: 'file',     // Change from 'file_end'
                payload: newFile.uri    // Change from bytes to the file URI
            })
            
            console.log(newFile.uri);
        }
    }

    const connectWebSocket = () => {
        // Close previous connection if any
        if (ws.current) {
            ws.current.close();
        }

        console.log("Connecting to:", WS_URL);
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log("WebSocket connected");
            setIsConnected(true);
            addMessage(ConnectedToServer);
        };

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data) {
                // The websocket is sending a file
                if (data.event_type.startsWith("file")) {
                    handleReceiveFile(data)
                }
                else {
                    console.log("Received:", data);
                    addMessage(data);
                }
            }
        };

        ws.current.onerror = (error) => {
            console.log("WebSocket error:", error.message);
            addMessage(WebsocketError);
        };

        ws.current.onclose = () => {
            console.log("WebSocket closed");
            setIsConnected(false);
            addMessage(WebsocketDisconnected);
        };
    };

    const addMessage = (data) => {
        setMessages((prev) => [
            ...prev,
            {
                id: Date.now().toString() + Math.random().toString(),
                from: data.username,
                event_type: data.event_type,
                payload: data.payload,
            },
        ]);
    };

    const sendFile = async (file) => {
        // Send the file
        await sendFileInChunks(file);
        
        // Update inputMedia
        setInputMedia(media => media.filter(f => file !== f));

        // Add the item to the chat
        messages.push({
            from: username.current,
            event_type: "file",
            payload: file
        })
    }

    const sendMessage = async () => {
        // MUST FIX TO NOT QUEUE MULTIPLE SENDS
        // OTHERWISE FUCKED UP INSANE DUPLICATION

        // Send attached files if any
        if (inputMedia.length > 0) {
            const mediaToSend = [...inputMedia];
            for (let file of mediaToSend) {
                await sendFile(file);
                console.log("SENT: " + file);
            }
        }

        // A text message is queued
        if (inputText.trim()) {
            const textToSend = inputText.trim();
            // Send the text message
            sendPayload("message", textToSend);
            setInputText("");

            // Add the item to the chat
            messages.push({
                from: username.current,
                event_type: "message",
                payload: textToSend
            })
        }
    };

    const sendPayload = (event_type, payload) => {
        if (!ws.current || ws.current.readyState != WebSocket.OPEN) {
            addMessage(NotConnected_Reconnect);
            connectWebSocket();
            return;
        }
        
        const data = {
            username: username.current,
            event_type: event_type,
            payload: payload
        }

        console.log("Created JSON Data");

        ws.current.send(JSON.stringify(data));
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

    const sendFileInChunks = async (fileUri) => {
        try {
            const sendFile = new File(fileUri);
            const chunkSize = 1024 * 64; // 64KB

            
            // Get the full file in raw bytes
            const bytes = await sendFile.bytes();
            const total = bytes.length;
            console.log(total);
            
            console.log(`Sending File: ${fileUri}`)
            // Let the websocket know we're sending a file
            sendPayload("file_start", sendFile.name);

            // Send the file in chunks
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                sendPayload("file", Array.from(chunk));
                await new Promise(r => setTimeout(r, 10));
            }

            // Let the websocket know the file was sent
            // Send the File md5 hash for verification
            sendPayload("file_end", null);
        } catch (err) {
            console.error("Error sending file in chunks:", err);
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.title}>React Native + FastAPI WebSocket</Text>
            <Text style={styles.status}>
                Status: {isConnected ? "😃 Connected" : "😔 Disconnected"}
            </Text>

            <View style={styles.messagesContainer}>
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
                    thumbnailSize={120}
                    media={inputMedia} 
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
        paddingVertical: 0,
        backgroundColor: "#f0f4ff",
    },
    title: {
        fontSize: 20,
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
