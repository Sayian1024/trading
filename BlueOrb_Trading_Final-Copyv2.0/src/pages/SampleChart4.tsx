import {
  useState,
  useEffect,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useMemo,
} from "react";
import ReactApexChart from "react-apexcharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { LuSendHorizonal } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ApexOptions } from "apexcharts";
import { IoIosMoon } from "react-icons/io";
import { FiSun } from "react-icons/fi";
import { FaRegBell } from "react-icons/fa";
import { Textarea } from "@/components/ui/textarea";
import { toast, Toaster } from "sonner";
const notificationSound = new Audio("/notification.mp3");

interface DataPoint {
  [key: string]: string | number;
  timestamp: string;
}

interface WebSocketMessage {
  params: {
    data: {
      added?: DataPoint[];
      changed?: DataPoint[];
      removed?: DataPoint[];
    };
  };
}

//last edit

const MAX_RENDER_POINTS = 500;

const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
};

const showDesktopNotification = (title: string, body: string) => {
  if (Notification.permission === "granted") {
    const notification = new Notification(title, {
      body,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
};

interface SearchBarProps {
  onSearch: (query: string) => Promise<void>;
}

const originalTitle = document.title;
let titleInterval: NodeJS.Timeout;

const updateTabTitle = (newMessage: boolean) => {
  if (newMessage) {
    titleInterval = setInterval(() => {
      document.title =
        document.title === originalTitle ? "🔔 New Message!" : originalTitle;
    }, 1000);
  } else {
    clearInterval(titleInterval);
    document.title = originalTitle;
  }
};

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
  const [query, setQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      await onSearch(searchQuery);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await handleSearch(query);
    console.log(query);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="relative flex flex-col w-full items-start rounded-md border">
          <Search className="absolute left-3 top-2 h-5 w-5 text-gray-500" />
          <Textarea
            placeholder="Enter your Prompt... (Press Shift + Enter for new line)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9  min-h-[6rem]  border-transparent  max-h-32 w-full rounded-lg resize-none border-0 bg-transparent focus:ring-0 focus-visible:ring-0  text-gray-400"
            rows={1}
          />
          <div className="flex justify-end w-full mt-auto">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-11 w-11 bg-[#475977] hover:bg-black mb-1 mr-1"
              disabled={!query.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LuSendHorizonal className="h-6 w-6 text-white" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

const DynamicApexChart = () => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [selectedColumns, setSelectedColumns] = useState([""]);
  const [xAxisColumn, setXAxisColumn] = useState("timestamp");
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [isNewRow] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);
  const [columns, setColumns] = useState<{ value: string; label: string }[]>([
    { value: "timestamp", label: "Timestamp" },
  ]);
  //const [websocketClient, setWebsocketClient] = useState<WebSocket | null>(null);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(
    new Set()
  );
  //const [subscribed, setSubscribed] = useState<boolean>(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  //const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] =
    useState(false);

  const IP = "34.231.217.211";
  const PORT = "8080";

  const toggleDesktopNotifications = async () => {
    if (!desktopNotificationsEnabled) {
      const granted = await requestNotificationPermission();
      setDesktopNotificationsEnabled(granted);

      if (granted) {
        toast.success("Desktop notifications enabled");
      } else {
        toast.error("Desktop notification permission denied");
      }
    } else {
      setDesktopNotificationsEnabled(false);
      toast.info("Desktop notifications disabled");
    }
  };

  const triggerNotification = useCallback(
    (added: any[], changed: any[]) => {
      // Only trigger if page is not visible
      if (!isPageVisible) {
        setBellAnimating(true);
        setShowNotification(true);

        // Play notification sound
        notificationSound.play().catch(console.error);

        // Update tab title
        updateTabTitle(true);

        // Show toast notification
        toast(
          `${added.length} row(s) added, ${changed.length} row(s) updated`,
          {
            description: `New data received at ${new Date().toLocaleTimeString()}`,
            action: {
              label: "Close",
              onClick: () => {
                toast.dismiss();
                setBellAnimating(false);
              },
            },
          }
        );

        if (desktopNotificationsEnabled) {
          showDesktopNotification(
            "Data Update",
            `${added.length} row(s) added, ${
              changed.length
            } row(s) updated at ${new Date().toLocaleTimeString()}`
          );
        }

        // Clear bell animation and reset after a delay
        setTimeout(() => {
          setBellAnimating(false);
          setShowNotification(false);
          updateTabTitle(false);
        }, 2000);
      }
    },
    [isPageVisible, notificationEnabled]
  );

  const handleWebSocketData = useCallback(
    (message: WebSocketMessage) => {
      if (message?.params?.data) {
        const { added = [], changed = [], removed = [] } = message.params.data;

        // Process and normalize timestamps
        const processData = (items: any[]) =>
          items.map((item) => ({
            ...item,
            id: item.id || crypto.randomUUID(), // Generate unique ID if not present
            timestamp: item.timestamp
              ? typeof item.timestamp === "number"
                ? new Date(
                    item.timestamp < 1e12
                      ? item.timestamp * 1000
                      : item.timestamp
                  ).toISOString()
                : item.timestamp
              : new Date().toISOString(),
          }));

        const processedAdded = processData(added);
        const processedChanged = processData(changed);

        // Update columns if not set
        if (
          columns.length === 1 &&
          (processedAdded.length > 0 || processedChanged.length > 0)
        ) {
          const allKeys = new Set<string>();
          Object.keys(processedAdded[0] || processedChanged[0] || {}).forEach(
            (key) => allKeys.add(key)
          );

          setColumns(
            Array.from(allKeys).map((key) => ({
              value: key,
              label: key.charAt(0).toUpperCase() + key.slice(1),
            }))
          );
        }

        if (added.length > 0 || changed.length > 0) {
          triggerNotification(added, changed);
        }

        setData((prev) => {
          // More robust data merging
          const existingMap = new Map(prev.map((item) => [item.id, item]));

          // Add or update added/changed items
          [...processedAdded, ...processedChanged].forEach((item) => {
            existingMap.set(item.id, item);
          });

          // Remove deleted items
          removed.forEach((item) => {
            existingMap.delete(item.id);
          });

          return Array.from(existingMap.values());
        });

        // Highlight new/changed rows
        const newHighlightIds = new Set<string>([
          ...processedAdded.map((item) => String(item.id)),
          ...processedChanged.map((item) => String(item.id)),
        ]);

        setHighlightedRows(newHighlightIds);

        // **Trigger notification for added or changed rows**
        if (processedAdded.length > 0 || processedChanged.length > 0) {
          setBellAnimating(true);
          setShowNotification(true);

          // Play notification sound
          notificationSound.play().catch(console.error);

          // Update tab title
          updateTabTitle(true);

          // Show toast notification
          toast(
            `${processedAdded.length} row(s) added, ${processedChanged.length} row(s) updated`,
            {
              description: `New data received at ${new Date().toLocaleTimeString()}`,
              action: {
                label: "Close",
                onClick: () => {
                  toast.dismiss();
                  setBellAnimating(false);
                },
              },
            }
          );

          // Desktop notification
          if (notificationEnabled) {
            showDesktopNotification(
              "Data Update",
              `${processedAdded.length} row(s) added, ${
                processedChanged.length
              } row(s) updated at ${new Date().toLocaleTimeString()}`
            );
          }

          // Clear bell animation and reset after a delay
          setTimeout(() => {
            setBellAnimating(false);
            setShowNotification(false);
            updateTabTitle(false);
          }, 2000);
        }

        // Clear highlights after 2 seconds
        setTimeout(() => {
          setHighlightedRows(new Set());
        }, 2000);
      }
    },
    [columns, triggerNotification]
  );

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const BASE_RECONNECT_TIMEOUT = 3000; // 3 seconds

    // Flag to prevent unnecessary reconnections
    let isUnloading = false;

    const createWebSocket = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const fullURI = `${wsProtocol}//${IP}:${PORT}`;

      ws = new WebSocket(fullURI);

      ws.onopen = () => {
        reconnectAttempts = 0; // Reset attempts on successful connection
        console.log("WebSocket connected successfully");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketData(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", event.data);
        }
      };

      ws.onclose = () => {
        // Only attempt reconnection if not intentionally closing
        if (!isUnloading && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const timeout = Math.min(
            BASE_RECONNECT_TIMEOUT * Math.pow(2, reconnectAttempts),
            30000 // Max 30 seconds between attempts
          );

          setTimeout(() => {
            reconnectAttempts++;
            console.log(`Reconnecting... (Attempt ${reconnectAttempts})`);
            createWebSocket();
          }, timeout);
        } else {
          console.error("Max reconnect attempts reached or intentional close.");
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        // Optionally close the connection to trigger reconnection
        ws?.close();
      };

      setSocket(ws);
    };

    // Prevent reconnection during page unload or visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        isUnloading = true;
        ws?.close();
      } else if (document.visibilityState === "visible") {
        isUnloading = false;
        // Optionally, you can add a delay before reconnecting
        setTimeout(() => {
          createWebSocket();
        }, 500);
      }
    };

    // Add visibility change listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial WebSocket connection
    createWebSocket();

    // Cleanup
    return () => {
      isUnloading = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (ws) {
        ws.onclose = null; // Remove onclose handler to prevent reconnection
        ws.close();
      }
    };
  }, [IP, PORT, handleWebSocketData]);

  const sendSearchQuery = useCallback(
    (query: string) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not connected");
      }

      const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "subscribe",
        params: {
          type: "data_stream",
          subscription_id: 1,
          query,
        },
      };

      try {
        socket.send(JSON.stringify(payload));
        console.log("Query sent:", payload);
      } catch (error) {
        console.error("Failed to send WebSocket message:", error);
        throw error;
      }
    },
    [socket]
  );

  useEffect(() => {
    const setupNotifications = async () => {
      const granted = await requestNotificationPermission();
      setNotificationEnabled(granted);
    };
    setupNotifications();
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearInterval(titleInterval);
      document.title = originalTitle;
    };
  }, []);

  useEffect(() => {
    setSelectedColumns((prev) => prev.filter((col) => col !== xAxisColumn));
  }, [xAxisColumn]);

  const generateColor = (column: string) => {
    // Generate a consistent color based on column name
    const hashCode = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash;
    };

    const h = Math.abs(hashCode(column)) % 360;
    return `hsl(${h}, 70%, 50%)`;
  };

  const colors = columns
    .filter((col) => col.value !== xAxisColumn)
    .map((col) => generateColor(col.value));
  //PrepareChartData is changed
  const prepareChartData = useCallback(() => {
    // Create a copy of data and sort it
    const sortedData = [...data]
      .sort((a, b) => {
        const aValue = a[xAxisColumn as keyof DataPoint];
        const bValue = b[xAxisColumn as keyof DataPoint];
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      })
      // Limit the number of points to render
      .slice(-MAX_RENDER_POINTS);

    return selectedColumns.map((column) => ({
      name: columns.find((col) => col.value === column)?.label || column,
      data: sortedData
        .map((item) => {
          let xValue = item[xAxisColumn as keyof DataPoint];
          let yValue = item[column as keyof DataPoint];

          // Normalize timestamp
          if (xAxisColumn === "timestamp") {
            xValue =
              typeof xValue === "string"
                ? new Date(xValue).getTime()
                : typeof xValue === "number" && xValue < 1e12
                ? xValue * 1000
                : xValue;
          }

          // Convert to number, handle NaN
          yValue = Number(yValue);

          return {
            x: typeof xValue === "number" && !isNaN(xValue) ? xValue : NaN,
            y: isNaN(yValue) ? 0 : yValue,
          };
        })
        .filter((point) => !isNaN(point.x) && !isNaN(point.y))
        .sort((a, b) => a.x - b.x),
    }));
  }, [data, selectedColumns, columns, xAxisColumn]);

  console.log("Received data:", data);
  const renderTableRows = () => {
    return data.map((row, idx) => (
      <tr
        key={`row-${row.id}-${idx}`} // Add index to ensure uniqueness
        className={`
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
            ${
              highlightedRows.has(String(row.id))
                ? isDarkMode
                  ? "bg-red-900"
                  : "bg-red-100"
                : ""
            }
            transition-colors duration-500 ease-in-out
          `}
      >
        {columns.map((column) => (
          <td
            key={`${row.id || "default"}-${column.value}-${idx}`} // Unique key here too
            className={`px-6 py-4 whitespace-nowrap text-sm ${
              isDarkMode ? "text-gray-300" : "text-gray-500"
            }`}
          >
            {column.value === "timestamp"
              ? new Date(row[column.value]).toLocaleString()
              : row[column.value] ?? "-"}
          </td>
        ))}
      </tr>
    ));
  };

  //Chart is Changed and it can give some issue

  const chartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        animations: {
          enabled: true,
          dynamicAnimation: {
            enabled: true,
            speed: 350, // Reduced speed for smoother updates
          },
        },
        toolbar: { show: true },
        background: isDarkMode ? "#1a1a1a" : "#ffffff",
        zoom: { enabled: true },
        stacked: false,
        events: {
          dataPointSelection: (config) => {
            // Optional: Add interactivity when data points are selected
            console.log(
              "Selected Data Point",
              config.dataPointIndex,
              config.seriesIndex
            );
          },
        },
      },
      stroke: {
        curve: "smooth", // Ensures smoother line rendering
        width: 2, // Slightly reduced line width for performance
      },
      xaxis: {
        type: xAxisColumn === "timestamp" ? "datetime" : "numeric",
        title: {
          text: columns.find((col) => col.value === xAxisColumn)?.label,
          style: { color: isDarkMode ? "#fff" : "#000" },
        },
        labels: {
          style: { colors: isDarkMode ? "#fff" : "#000" },
          formatter: function (value: number | string): string {
            return xAxisColumn === "timestamp"
              ? new Date(value).toLocaleTimeString()
              : String(value);
          },
        },
        tickAmount: 10,
      },
      yaxis: {
        title: {
          text: "Values",
          style: { color: isDarkMode ? "#fff" : "#000" },
        },
        labels: {
          style: { colors: isDarkMode ? "#fff" : "#000" },
          formatter: (value) => value.toFixed(2), // Round to 2 decimal places
        },
        tickAmount: 5,
      },
      grid: {
        borderColor: isDarkMode ? "#404040" : "#e0e0e0",
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: true } },
      },
      theme: {
        mode: isDarkMode ? "dark" : "light",
      },
      legend: {
        labels: {
          colors: isDarkMode ? "#fff" : "#000",
        },
      },
      tooltip: {
        theme: isDarkMode ? "dark" : "light",
        x: {
          formatter: function (value: number): string {
            return xAxisColumn === "timestamp"
              ? new Date(value).toLocaleString()
              : String(value);
          },
        },
      },
      colors: colors,
      markers: {
        size: 0, // Remove markers to improve performance
        hover: { size: 0 },
      },
      fill: {
        type: "solid",
        opacity: 0.7,
      },
      // Optimize rendering
      performance: {
        renderAllAtOnce: false, // Can help with smoother updates
      },
    }),
    [isDarkMode, xAxisColumn, columns, colors]
  );

  const handleColumnToggle = (column: string) => {
    if (column === xAxisColumn) return;
    setSelectedColumns((prev) =>
      prev.includes(column)
        ? prev.filter((col) => col !== column)
        : [...prev, column]
    );
  };

  const handleSearch = async (query: string): Promise<void> => {
    try {
      sendSearchQuery(query);
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Search failed. Please try again.");
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div
      className={`p-4 ${
        isDarkMode ? "bg-gray-900 text-white" : "bg-white text-black"
      }`}
    >
      <Card className={isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white"}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className={isDarkMode ? "text-white" : "text-black"}>
            <div className="flex items-center">
              <span
                className={`text-3xl font-semibold ml-3 ${
                  isDarkMode ? "text-white" : "text-black"
                }`}
              >
                Trading Logo
              </span>
            </div>
          </CardTitle>
          <Toaster />
          <div className="space-x-4 flex items-center">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`px-5 py-4 rounded-md ${
                isDarkMode
                  ? "bg-gray-700 text-white hover:bg-gray-600"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {isDarkMode ? <FiSun /> : <IoIosMoon />}
            </button>
            <div className="relative">
              <button
                onClick={toggleDesktopNotifications}
                className={`px-5 py-4 rounded-md ${
                  isDarkMode
                    ? "bg-gray-700 text-white hover:bg-gray-600"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                <FaRegBell className={bellAnimating ? "animate-bounce" : ""} />
                {showNotification && (
                  <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-red-500 animate-ping" />
                )}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-2 sm:px-6">
          <div className="mb-4 w-full">
            <select
              value={xAxisColumn}
              onChange={(e) => setXAxisColumn(e.target.value)}
              className={`w-full sm:w-64 p-2 text-sm sm:text-base rounded-md border ${
                isDarkMode
                  ? "bg-gray-700 border-gray-600 text-white"
                  : "bg-white border-gray-300 text-black"
              }`}
            >
              {columns.map((column) => (
                <option key={column.value} value={column.value}>
                  {column.label} (X-Axis)
                </option>
              ))}
            </select>
          </div>

          <div className="h-64 sm:h-96 mb-4 sm:mb-6">
            <ReactApexChart
              options={{
                ...chartOptions,
                chart: {
                  ...chartOptions.chart,
                  zoom: {
                    enabled: true,
                    type: "xy",
                    autoScaleYaxis: true,
                    zoomedArea: {
                      fill: {
                        color: "#90CAF9",
                        opacity: 0.4,
                      },
                      stroke: {
                        color: "#0D47A1",
                        opacity: 0.4,
                        width: 1,
                      },
                    },
                  },
                  toolbar: {
                    show: true,
                    autoSelected: "zoom",
                    tools: {
                      download: true,
                      selection: true,
                      zoom: true,
                      zoomin: true,
                      zoomout: true,
                      pan: true,
                      reset: true,
                    },
                  },
                },
                tooltip: {
                  ...chartOptions.tooltip,
                  intersect: false,
                  shared: true,
                  style: {
                    fontSize: "12px",
                  },
                },
                legend: {
                  position: "bottom",
                  horizontalAlign: "center",
                  fontSize: "12px",
                  offsetY: 0,
                  itemMargin: {
                    horizontal: 10,
                    vertical: 5,
                  },
                  onItemClick: {
                    toggleDataSeries: true,
                  },
                  onItemHover: {
                    highlightDataSeries: true,
                  },
                },
                stroke: {
                  curve: "smooth",
                  width: 2,
                },
              }}
              series={prepareChartData()}
              type="line"
              height="100%"
            />
          </div>

          <ScrollArea
            className={`overflow-x-auto h-[410px] border-collapse border ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <table className="min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className={isDarkMode ? "bg-gray-800" : "bg-gray-50"}>
                  {columns.map((column) => (
                    <th key={column.value} className="px-6 py-3">
                      <div className="flex items-center space-x-2">
                        {column.value !== xAxisColumn && (
                          <Checkbox
                            id={`header-${column.value}`}
                            checked={selectedColumns.includes(column.value)}
                            onCheckedChange={() =>
                              handleColumnToggle(column.value)
                            }
                            className={
                              isDarkMode ? "border-gray-500" : "border-gray-300"
                            }
                          />
                        )}
                        <span
                          className={`text-xs font-medium uppercase tracking-wider ${
                            isDarkMode ? "text-gray-300" : "text-gray-500"
                          }`}
                        >
                          {column.label}
                          {column.value === xAxisColumn && " (X-Axis)"}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  isDarkMode ? "divide-gray-700" : "divide-gray-200"
                }`}
              >
                {data.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`${isDarkMode ? "bg-gray-800" : "bg-white"} ${
                      idx === data.length - 1 && isNewRow
                        ? "animate-pulse bg-green-100"
                        : ""
                    }`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.value}
                        className={`px-6 py-4 whitespace-nowrap text-sm ${
                          isDarkMode ? "text-gray-300" : "text-gray-500"
                        }`}
                      >
                        {column.value === "timestamp"
                          ? new Date(
                              row[column.value as keyof DataPoint]
                            ).toLocaleString()
                          : row[column.value as keyof DataPoint]}
                      </td>
                    ))}
                  </tr>
                ))}
                {renderTableRows()}
              </tbody>
            </table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <div className="flex w-full flex-col space-y-4 p-6 sm:flex-row sm:items-center sm:justify-center sm:space-y-0 sm:space-x-6">
            <SearchBar onSearch={handleSearch} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default DynamicApexChart;
