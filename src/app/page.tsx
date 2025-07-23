import Chat from "@/components/Chat";


export default function Home() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "1rem" }}>
        <a href="https://github.com/blustAI/walleot-demo-chat" target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </div>
      <Chat />
    </>
  );
}