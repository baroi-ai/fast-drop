"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Peer, { DataConnection } from "peerjs";

// --- TYPES ---
interface ReceivedFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "sending" | "done" | "cancelled";
  progress: number;
}

interface ExpectedFile {
  name: string;
  size: number;
  status: "pending" | "receiving" | "done" | "cancelled";
}

// --- MAIN LOGIC COMPONENT ---
function FileDropLogic() {
  const searchParams = useSearchParams();
  const connectToId = searchParams.get("connect");

  const [peerId, setPeerId] = useState<string>("");
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState<string>(
    "Initializing secure connection...",
  );

  // SENDER STATE
  const [sendQueue, setSendQueue] = useState<QueuedFile[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Add this near line 45
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    navigator.clipboard.writeText(connectionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const queueRef = useRef<QueuedFile[]>([]);
  useEffect(() => {
    queueRef.current = sendQueue;
  }, [sendQueue]);

  // RECEIVER STATE
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);

  const [expectedFiles, setExpectedFiles] = useState<ExpectedFile[]>([]);
  const [receiveProgress, setReceiveProgress] = useState<number>(0);

  const peerInstance = useRef<Peer | null>(null);
  const receiveBuffer = useRef<ArrayBuffer[]>([]);
  const incomingFileInfo = useRef<any>(null);
  const receivedBytesRef = useRef<number>(0);

  const [menuOpen, setMenuOpen] = useState(false);

  // -------------------------------------------------------------
  // INITIALIZATION & CONNECTION LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    if (peerInstance.current) {
      peerInstance.current.destroy();
    }

    const peer = new Peer({
      debug: 1,
    });

    peerInstance.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      if (connectToId) {
        setStatus(`Connecting to device...`);
        const conn = peer.connect(connectToId, { reliable: true });
        setupConnection(conn);
      } else {
        setStatus("Waiting for connection... Scan the QR code.");
      }
    });

    peer.on("connection", (conn) => {
      setStatus("Device connected! Secure tunnel established.");
      setupConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("PeerJS Error:", err);

      if (err.type === "peer-unavailable") {
        setStatus(
          "Sender disconnected. Please close this tab and rescan the NEW QR code.",
        );
        setConnection(null);
      } else if (err.type === "network" || err.type === "server-error") {
        setStatus("Network dropped. Please refresh the PC page and rescan.");
        setConnection(null);
      } else {
        setStatus(`Connection Error: ${err.message}`);
      }
    });

    return () => {
      if (peerInstance.current) {
        peerInstance.current.disconnect();
        setTimeout(() => peerInstance.current?.destroy(), 500);
      }
    };
  }, [connectToId]);

  const setupConnection = (conn: DataConnection) => {
    setConnection(conn);

    conn.on("open", () => setStatus("Connected and ready to transfer."));

    conn.on("data", (data: any) => {
      if (data.type === "queue_info") {
        setExpectedFiles((prev) => {
          const newFiles = data.files.filter(
            (newF: any) => !prev.some((p) => p.name === newF.name),
          );
          return [
            ...prev,
            ...newFiles.map((f: any) => ({ ...f, status: "pending" as const })),
          ];
        });
      } else if (data.type === "metadata") {
        incomingFileInfo.current = data;
        receiveBuffer.current = [];
        receivedBytesRef.current = 0;

        setReceiveProgress(0);
        setStatus(`Receiving file...`);

        setExpectedFiles((prev) =>
          prev.map((f) =>
            f.name === data.filename ? { ...f, status: "receiving" } : f,
          ),
        );
      } else if (data.type === "chunk") {
        receiveBuffer.current.push(data.data);
        receivedBytesRef.current += data.data.byteLength;

        if (incomingFileInfo.current) {
          const progress = Math.min(
            100,
            Math.round(
              (receivedBytesRef.current / incomingFileInfo.current.size) * 100,
            ),
          );
          setReceiveProgress(progress);
        }
      } else if (data.type === "cancel") {
        receiveBuffer.current = [];
        incomingFileInfo.current = null;
        receivedBytesRef.current = 0;

        setReceiveProgress(0);
        setStatus(`Sender cancelled a file.`);

        setExpectedFiles((prev) =>
          prev.map((f) =>
            f.name === data.filename ? { ...f, status: "cancelled" } : f,
          ),
        );
      } else if (data.type === "receiver_cancel") {
        queueRef.current = queueRef.current.map((item) =>
          item.status === "sending" ? { ...item, status: "cancelled" } : item,
        );
        setSendQueue([...queueRef.current]);
        setStatus("Receiver skipped a file.");
      } else if (data.type === "receiver_cancel_all") {
        queueRef.current = queueRef.current.map((item) =>
          item.status === "sending" || item.status === "pending"
            ? { ...item, status: "cancelled" }
            : item,
        );
        setSendQueue([...queueRef.current]);
        setStatus("Receiver aborted all transfers.");
      } else if (data.type === "eof") {
        if (!incomingFileInfo.current) return;

        const finalName = incomingFileInfo.current.filename;
        const finalType = incomingFileInfo.current.filetype;
        const finalSize = incomingFileInfo.current.size;

        const blob = new Blob(receiveBuffer.current, { type: finalType });
        const url = window.URL.createObjectURL(blob);

        setReceivedFiles((prev) => [
          ...prev,
          { name: finalName, url, type: finalType, size: finalSize },
        ]);

        setStatus("File saved successfully.");

        setExpectedFiles((prev) =>
          prev.map((f) =>
            f.name === finalName ? { ...f, status: "done" } : f,
          ),
        );

        receiveBuffer.current = [];
        incomingFileInfo.current = null;
        receivedBytesRef.current = 0;
        setReceiveProgress(0);
      }
    });

    conn.on("close", () => {
      setStatus("Device disconnected.");
      setConnection(null);
      setIsSending(false);

      queueRef.current = queueRef.current.map((item) =>
        item.status === "sending" || item.status === "pending"
          ? { ...item, status: "cancelled" }
          : item,
      );
      setSendQueue([...queueRef.current]);

      setExpectedFiles((prev) =>
        prev.map((f) =>
          f.status === "pending" || f.status === "receiving"
            ? { ...f, status: "cancelled" }
            : f,
        ),
      );

      receiveBuffer.current = [];
      incomingFileInfo.current = null;
      receivedBytesRef.current = 0;
      setReceiveProgress(0);
    });
  };

  // -------------------------------------------------------------
  // SENDER LOGIC: QUEUE MANAGEMENT
  // -------------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: "pending" as const,
        progress: 0,
      }));
      setSendQueue((prev) => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const updateQueueItem = (id: string, updates: Partial<QueuedFile>) => {
    setSendQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const cancelIndividualFile = (id: string) => {
    updateQueueItem(id, { status: "cancelled" });
  };

  const cancelAllFiles = () => {
    setSendQueue((prev) =>
      prev.map((item) => {
        if (item.status === "pending" || item.status === "sending") {
          return { ...item, status: "cancelled" };
        }
        return item;
      }),
    );
  };

  const removeDoneFiles = () => {
    setSendQueue((prev) =>
      prev.filter(
        (item) => item.status !== "done" && item.status !== "cancelled",
      ),
    );
  };

  const startSendingQueue = () => {
    if (!connection) return;
    setIsSending(true);

    const pendingFiles = queueRef.current
      .filter((f) => f.status === "pending")
      .map((f) => ({ name: f.file.name, size: f.file.size }));

    if (pendingFiles.length > 0) {
      connection.send({ type: "queue_info", files: pendingFiles });
    }

    const CHUNK_SIZE = 64 * 1024;

    const processNext = (index: number) => {
      const currentQueue = queueRef.current;

      if (index >= currentQueue.length) {
        setStatus("Queue processing complete.");
        setIsSending(false);
        return;
      }

      const item = currentQueue[index];

      if (item.status === "cancelled" || item.status === "done") {
        processNext(index + 1);
        return;
      }

      updateQueueItem(item.id, { status: "sending" });
      setStatus(`Sending file ${index + 1} of ${currentQueue.length}...`);

      connection.send({
        type: "metadata",
        filename: item.file.name,
        filetype: item.file.type,
        size: item.file.size,
      });

      let offset = 0;

      const readNextChunk = () => {
        const latestItemState = queueRef.current.find((q) => q.id === item.id);
        if (latestItemState?.status === "cancelled") {
          connection.send({ type: "cancel", filename: item.file.name });
          processNext(index + 1);
          return;
        }

        if (
          connection.dataChannel &&
          connection.dataChannel.bufferedAmount > 1024 * 1024
        ) {
          setTimeout(readNextChunk, 50);
          return;
        }

        const slice = item.file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target?.result) {
            connection.send({ type: "chunk", data: e.target.result });

            offset += CHUNK_SIZE;
            const progress = Math.min(
              100,
              Math.round((offset / item.file.size) * 100),
            );
            updateQueueItem(item.id, { progress });

            if (offset < item.file.size) {
              setTimeout(readNextChunk, 1);
            } else {
              connection.send({ type: "eof" });
              updateQueueItem(item.id, { status: "done", progress: 100 });
              processNext(index + 1);
            }
          }
        };
        reader.readAsArrayBuffer(slice);
      };

      readNextChunk();
    };

    processNext(0);
  };

  // -------------------------------------------------------------
  // RECEIVER LOGIC
  // -------------------------------------------------------------
  const cancelIncomingTransfer = () => {
    if (connection) {
      connection.send({ type: "receiver_cancel" });

      receiveBuffer.current = [];
      incomingFileInfo.current = null;
      receivedBytesRef.current = 0;
      setReceiveProgress(0);

      setExpectedFiles((prev) =>
        prev.map((f) =>
          f.status === "receiving" ? { ...f, status: "cancelled" } : f,
        ),
      );
      setStatus("You skipped the active file.");
    }
  };

  const cancelAllIncoming = () => {
    if (connection) {
      connection.send({ type: "receiver_cancel_all" });

      receiveBuffer.current = [];
      incomingFileInfo.current = null;
      receivedBytesRef.current = 0;
      setReceiveProgress(0);

      setExpectedFiles((prev) =>
        prev.map((f) =>
          f.status === "pending" || f.status === "receiving"
            ? { ...f, status: "cancelled" }
            : f,
        ),
      );
      setStatus("You cancelled all incoming files.");
    }
  };

  const handleDownloadAllSequential = async () => {
    if (receivedFiles.length === 0) return;
    setIsDownloadingAll(true);

    for (let i = 0; i < receivedFiles.length; i++) {
      const file = receivedFiles[i];
      setStatus(`Downloading file ${i + 1} of ${receivedFiles.length}...`);

      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    setStatus("All files downloaded to your device!");
    setIsDownloadingAll(false);
  };

  const disconnectFromPeer = () => {
    if (connection) {
      connection.close();
    }
  };

  // -------------------------------------------------------------
  // UI HELPERS
  // -------------------------------------------------------------
  const isDev = process.env.NODE_ENV === "development";
  //const baseUrl = isDev
  // ? "http://192.168.1.2:3000"
  // : typeof window !== "undefined"
  //   ? window.location.origin
  //  : "";
  //const connectionUrl =
  // typeof window !== "undefined"
  //  ? `${baseUrl}${window.location.pathname}?connect=${peerId}`
  //  : "";

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const connectionUrl =
    typeof window !== "undefined"
      ? `${baseUrl}${window.location.pathname}?connect=${peerId}`
      : "";

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const activeIncomingFiles = expectedFiles.filter(
    (f) => f.status === "pending" || f.status === "receiving",
  );

  const hasActiveQueueItems = sendQueue.some(
    (q) => q.status === "pending" || q.status === "sending",
  );
  const hasFinishedQueueItems = sendQueue.some(
    (q) => q.status === "done" || q.status === "cancelled",
  );

  return (
    <div className="flex flex-col items-center justify-center p-4 md:p-8 w-full max-w-5xl mx-auto mt-20 space-y-8 pb-32">
      <div className="w-full bg-[#1e2025] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 bg-[#111315] border-b border-gray-800 text-[#00E585] text-sm font-mono flex items-center justify-center shadow-inner">
          <span className="opacity-70 text-gray-400 mr-2">Status:</span>
          <span className="truncate max-w-2xl">{status}</span>
        </div>

        <div
          className={`grid grid-cols-1 ${!connectToId ? "md:grid-cols-2 divide-y md:divide-y-0 md:divide-x" : ""} divide-gray-800 min-h-[500px]`}
        >
          <div className="p-6 md:p-8 flex flex-col relative bg-[#1e2025]">
            {!connectToId && (
              <div className="flex-1 flex flex-col items-center justify-center h-full">
                {!connection ? (
                  <div className="flex flex-col items-center space-y-6 w-full">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      Pair Device
                    </h2>
                    <p className="text-sm text-gray-400 text-center max-w-xs leading-relaxed">
                      Scan this QR code with your mobile device to establish a
                      secure, peer-to-peer connection.
                    </p>
                    {/* Replace the QR section around line 380 */}
                    {peerId ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="p-4 bg-white rounded-2xl shadow-[0_0_40px_rgba(0,229,133,0.15)] transition-all">
                          <QRCodeSVG value={connectionUrl} size={200} />
                        </div>

                        {/* NEW COPY LINK BUTTON */}
                        <button
                          onClick={copyInviteLink}
                          className="flex items-center gap-2 px-5 py-2.5 bg-[#111315] hover:bg-gray-800 text-white rounded-xl transition-all border border-gray-800 text-sm font-bold shadow-lg"
                        >
                          <svg
                            className="w-4 h-4 text-[#00E585]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            ></path>
                          </svg>
                          {copied ? "Link Copied!" : "Copy Invite Link"}
                        </button>
                      </div>
                    ) : (
                      <div className="w-[232px] h-[232px] flex items-center justify-center border-2 border-dashed border-gray-700 rounded-2xl bg-[#111315]">
                        <span className="text-[#00E585] animate-pulse font-mono text-sm">
                          Generating keys...
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-6 w-full">
                    <div className="w-24 h-24 rounded-full bg-[#00E585]/10 flex items-center justify-center border border-[#00E585]/30 shadow-[0_0_30px_rgba(0,229,133,0.2)]">
                      <svg
                        className="w-10 h-10 text-[#00E585]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-2xl font-bold text-white">
                        Device Connected
                      </h2>
                      <p className="text-sm text-gray-400 max-w-xs mx-auto">
                        A secure WebRTC tunnel has been established. Ready to
                        transfer files.
                      </p>
                    </div>

                    <button
                      onClick={disconnectFromPeer}
                      className="mt-2 px-6 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl transition-colors text-sm font-bold shadow-lg shadow-red-500/10"
                    >
                      Disconnect Device
                    </button>
                  </div>
                )}
              </div>
            )}

            {connectToId && (
              <div className="flex flex-col space-y-6 w-full h-full">
                {/* --- NEW: RECEIVER CONNECTION STATUS BAR --- */}
                <div className="flex justify-between items-center bg-[#111315] p-4 rounded-xl border border-gray-800 shadow-sm shrink-0">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${connection ? "bg-[#00E585] animate-pulse" : "bg-red-500"}`}
                    ></div>
                    <div>
                      <h2 className="text-white font-bold text-sm">
                        {connection ? "Connected to Sender" : "Disconnected"}
                      </h2>
                      <p className="text-xs text-gray-500 font-mono">
                        {connection ? "Remote Link Active" : "Tunnel Closed"}
                      </p>
                    </div>
                  </div>
                  {connection && (
                    <button
                      onClick={disconnectFromPeer}
                      className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-lg transition-colors text-xs font-bold shadow-lg"
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                {activeIncomingFiles.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                      <h4 className="text-md font-bold text-[#00E585]">
                        Incoming Queue ({activeIncomingFiles.length})
                      </h4>
                      <button
                        onClick={cancelAllIncoming}
                        className="text-xs text-red-500 hover:text-red-400 transition font-medium"
                      >
                        Cancel All
                      </button>
                    </div>

                    <ul className="space-y-3 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                      {activeIncomingFiles.map((file, idx) => {
                        const isReceiving = file.status === "receiving";
                        return (
                          <li
                            key={idx}
                            className={`p-4 bg-[#111315] rounded-xl border ${isReceiving ? "border-[#00E585]/50 shadow-[0_0_15px_rgba(0,229,133,0.1)]" : "border-gray-800"} relative overflow-hidden`}
                          >
                            {isReceiving && (
                              <div
                                className="absolute top-0 left-0 h-full bg-[#00E585]/10 z-0 transition-all duration-200"
                                style={{ width: `${receiveProgress}%` }}
                              ></div>
                            )}
                            <div className="relative z-10">
                              <div className="flex justify-between items-center mb-1">
                                <span
                                  className={`text-sm font-medium truncate pr-4 ${isReceiving ? "text-white" : "text-gray-400"}`}
                                >
                                  {file.name}
                                </span>
                                <span className="text-xs text-gray-500 shrink-0">
                                  {formatBytes(file.size)}
                                </span>
                              </div>
                              {isReceiving ? (
                                <div className="flex items-center gap-3 mt-3">
                                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                                    <div
                                      className="bg-[#00E585] h-1.5 rounded-full transition-all duration-200"
                                      style={{ width: `${receiveProgress}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-mono text-[#00E585] shrink-0">
                                    {receiveProgress}%
                                  </span>
                                  <button
                                    onClick={cancelIncomingTransfer}
                                    className="shrink-0 px-2 py-1 text-xs bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition"
                                  >
                                    Stop
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-600 mt-1 block">
                                  Waiting in line...
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-end border-b border-gray-800 pb-2">
                    <h3 className="text-md font-bold text-white">
                      Received Inbox
                    </h3>
                    {receivedFiles.length > 0 && (
                      <button
                        onClick={handleDownloadAllSequential}
                        disabled={isDownloadingAll}
                        className="text-xs bg-[#00E585] text-black px-3 py-1.5 rounded-lg font-bold hover:bg-[#00C875] transition disabled:opacity-50"
                      >
                        {isDownloadingAll ? "Downloading..." : "Download All"}
                      </button>
                    )}
                  </div>

                  {receivedFiles.length === 0 ? (
                    <div className="flex items-center justify-center h-[280px] bg-[#111315]/40 rounded-xl border border-dashed border-gray-800">
                      <p className="text-sm text-gray-500 text-center">
                        No files received yet.
                        <br />
                        Waiting for sender...
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-3 h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                      {receivedFiles.map((file, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between p-3 bg-[#111315] rounded-xl border border-gray-800 hover:border-gray-700 transition"
                        >
                          <div className="flex flex-col truncate pr-4">
                            <span className="text-sm font-medium text-white truncate">
                              {file.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                          <a
                            href={file.url}
                            download={file.name}
                            className="shrink-0 px-4 py-2 bg-[#00E585]/10 text-[#00E585] hover:bg-[#00E585] hover:text-black font-semibold text-xs rounded-lg transition-colors"
                          >
                            Save
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {!connectToId && (
            <div className="p-6 md:p-8 flex flex-col space-y-6 bg-[#1a1c21] relative">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">
                  Transfer Station
                </h3>
              </div>

              <label className="flex flex-col items-center justify-center w-full min-h-[120px] border-2 border-dashed border-gray-700 rounded-xl cursor-pointer bg-[#111315] hover:bg-gray-800 transition p-6 group shrink-0">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 mb-3 rounded-full bg-gray-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg
                      className="w-5 h-5 text-[#00E585]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-400">
                    <span className="font-semibold text-[#00E585]">
                      Click to browse
                    </span>{" "}
                    or drag files here
                  </p>
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>

              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <h4 className="text-md font-bold text-gray-300">
                    Outbox Queue
                  </h4>
                  <div className="space-x-3">
                    {hasFinishedQueueItems && (
                      <button
                        onClick={removeDoneFiles}
                        className="text-xs text-gray-500 hover:text-white transition"
                      >
                        Clear Done
                      </button>
                    )}
                    {hasActiveQueueItems && (
                      <button
                        onClick={cancelAllFiles}
                        className="text-xs text-red-500 hover:text-red-400 transition"
                      >
                        Cancel All
                      </button>
                    )}
                  </div>
                </div>

                {sendQueue.length === 0 ? (
                  <div className="flex items-center justify-center h-[280px] bg-[#111315]/40 rounded-xl border border-dashed border-gray-800">
                    <p className="text-sm text-gray-600 text-center">
                      No files selected.
                      <br />
                      Queue up files while you wait.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3 h-[280px] overflow-y-auto custom-scrollbar pr-2">
                    {sendQueue.map((item) => (
                      <li
                        key={item.id}
                        className="p-3 bg-[#111315] rounded-xl border border-gray-800 relative overflow-hidden"
                      >
                        {item.status === "sending" && (
                          <div
                            className="absolute top-0 left-0 h-full bg-[#00E585]/10 z-0 transition-all duration-200"
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        )}
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex flex-col truncate pr-4">
                            <span
                              className={`text-sm font-medium truncate ${item.status === "cancelled" ? "text-gray-600 line-through" : "text-white"}`}
                            >
                              {item.file.name}
                            </span>
                            <span className="text-xs text-gray-500 flex gap-2">
                              {formatBytes(item.file.size)}
                              {item.status === "done" && (
                                <span className="text-[#00E585]">✓ Sent</span>
                              )}
                              {item.status === "sending" && (
                                <span className="text-[#00E585]">
                                  {item.progress}%
                                </span>
                              )}
                              {item.status === "cancelled" && (
                                <span className="text-red-500">Cancelled</span>
                              )}
                              {item.status === "pending" && (
                                <span className="text-gray-400">
                                  Waiting...
                                </span>
                              )}
                            </span>
                          </div>
                          {(item.status === "pending" ||
                            item.status === "sending") && (
                            <button
                              onClick={() => cancelIndividualFile(item.id)}
                              className="shrink-0 px-2 py-1 text-xs bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition"
                            >
                              Stop
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-2 shrink-0">
                <button
                  onClick={startSendingQueue}
                  disabled={
                    !connection ||
                    isSending ||
                    !sendQueue.some((q) => q.status === "pending")
                  }
                  className="w-full py-4 px-4 bg-[#00E585] hover:bg-[#00C875] disabled:bg-[#111315] disabled:border disabled:border-gray-800 disabled:text-gray-500 text-black font-bold rounded-xl transition-all shadow-lg shadow-[#00E585]/10 disabled:shadow-none"
                >
                  {!connection
                    ? "Waiting for Connection..."
                    : isSending
                      ? "Processing Queue..."
                      : `Secure Send ${sendQueue.filter((q) => q.status === "pending").length > 0 ? `(${sendQueue.filter((q) => q.status === "pending").length})` : ""}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0d14] text-gray-200 font-sans selection:bg-[#00E585] selection:text-black">
      <nav className="w-full flex items-center justify-between px-6 py-4  bg-[#0a0d14]/80 backdrop-blur-md fixed top-0 left-0 z-50">
        {/* Update this section inside your <nav> tag */}
        <div className="flex items-center gap-3">
          <img
            src="/fast-drop/logo.png"
            alt="FastDrop Logo"
            className="w-8 h-8 rounded-lg border border-[#00E585]/50 shadow-[0_0_15px_rgba(0,229,133,0.4)] object-cover"
          />
          <span className="text-xl font-extrabold tracking-tight text-white">
            Fast<span className="text-[#00E585]">Drop</span>
          </span>
        </div>
        <div className="flex gap-6 items-center">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Home
          </a>
          <a
            href="https://ko-fi.com/baroi"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-gray-400 hover:text-[#00E585] transition-colors"
          >
            Donate
          </a>
        </div>
      </nav>

      <Suspense
        fallback={
          <div className="mt-32 text-center text-[#00E585]">
            Loading secure environment...
          </div>
        }
      >
        <FileDropLogic />
      </Suspense>
    </main>
  );
}
