import brandLogo from "@/assets/brand-logo.png";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { hardRefresh } from "@/lib/hardRefresh";
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  SplitSquareHorizontal,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const mainItems = [
  { title: "Books", url: "/books", icon: BookOpen },
  { title: "Split Bills", url: "/split-bills", icon: SplitSquareHorizontal },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div
          className={`px-4 py-5 ${collapsed ? "px-2 pl-2" : ""} flex justify-between`}
        >
          <div className="flex items-center gap-2 flex-nowrap">
            <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center flex-nowrap flex-shrink-0 shadow">
              <img
                src={brandLogo}
                alt="Bookish Finance logo"
                width={32}
                height={32}
                className="w-full h-full object-contain"
              />
            </div>
            {!collapsed && (
              <span className="font-display font-bold text-lg text-nowrap">
                Bookish Finance
              </span>
            )}
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="text-base h-11">
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard" || item.url === "/books/*"}
                      className="sm:hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={`p-3 ${collapsed ? "pl-0" : ""} gap-1`}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground sm:hover:bg-muted/60 sm:hover:text-foreground"
          onClick={() => hardRefresh()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {!collapsed && "Hard Refresh"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground sm:hover:bg-destructive/10 sm:hover:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
