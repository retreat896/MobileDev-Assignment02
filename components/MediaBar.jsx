import { View, Image, Pressable, ScrollView } from "react-native";
import { Text, IconButton } from 'react-native-paper';
import { useRef } from "react";

const MediaBar = ({ media=[], thumbnailSize, removeItem }) => {
	// Reference Variables
	// To keep track of scroll position when an item is removed
	const scrollRef = useRef(null);
	const scrollX = useRef(0);
	const removedIndexRef = useRef(null);

	// Handle media removal
	const handleRemoveItem = (uri) => {
		// Store the removed index
		const idx = media.indexOf(uri);
		removedIndexRef.current = idx;

		// Run the callback function
		removeItem(uri);
	}

	// Update the scroll X value
	const onScroll = (e) => {
		scrollX.current = e.nativeEvent.contentOffset.x;
	};

	// Update the scroll view when list changes
	const onContentSizeChange = () => {
		const curX = scrollX.current;
		const firstVisible = Math.floor(curX / thumbnailSize);
		const removedIdx = removedIndexRef.current;
		let newX = curX;
		if (removedIdx !== null && removedIdx <= firstVisible) {
		newX = Math.max(0, curX - thumbnailSize);
		}
		// reset marker
		removedIndexRef.current = null;
		scrollRef.current?.scrollTo({ x: newX, animated: false });
	};


	// If no media to display, then show nothing
	if (media.length == 0) {
		return null;
	}

	return (
		<ScrollView
			ref={scrollRef}
			horizontal
			showsHorizontalScrollIndicator={false}
			style={{ marginBottom: 8 }}
			onScroll={onScroll}
			scrollEventThrottle={16}
			onContentSizeChange={onContentSizeChange}
		>
			{media.map((uri) => (
				<View
					key={uri}
					style={{
						marginRight: 10,
						width: thumbnailSize,
						height: thumbnailSize,
						borderRadius: 8,
						overflow: "hidden",
						position: "relative",
					}}
				>
					<Image
						source={{ uri }}
						style={{ width: "100%", height: "100%" }}
					/>

					<Pressable
						onPress={() => handleRemoveItem(uri)}
						style={{
							position: "absolute",
							top: 0,
							right: 0,
							backgroundColor: '#DD8888',
							borderRadius: 40,
							paddingVertical: 0,
							paddingHorizontal: 8,
							elevation: 5,
						}}
					>
						<Text variant="bodyLarge" style={{ fontWeight: "bold" }}>×</Text>
					</Pressable>
				</View>
			))}
		</ScrollView>
	);
}

export default MediaBar;