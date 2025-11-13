import { Stack, Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";

export default function Layout() {
  // Page Stack
  // 1. Show All Robots (GET /robots)
  // 2. Show One Robot (GET /robots/:name)
  // 3. Add Robot (POST /robots)
  // 4. Update Robot (PUT/PATCH /robots/:name)
  // 5. Delete Robot (DELETE /robots/:name)

  const colorScheme = useColorScheme(); // Returns 'dark' or 'light'
  
  const theme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  
  return (
    <PaperProvider theme={theme}>
      <Stack>
        {/* Show All Robots (GET /robots) */}
        <Stack.Screen
          name="index"
          options={{
            title: "Robots",
            headerStyle: { backgroundColor: "#111827" },
            headerTintColor: "#fff",
          }}
        />
        {/* Show One Robot (GET /robots/:name) */}
        <Stack.Screen
          name="single"
          options={{
            title: "Single Robot",
            headerStyle: { backgroundColor: "#111827" },
            headerTintColor: "#fff",
          }}
        />
      </Stack>
    </PaperProvider>
  );
}
