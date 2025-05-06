# Load required libraries
library(shiny)
library(shinydashboard)
library(leaflet)
library(httr)
library(jsonlite)
library(dplyr)

# ------ Data Retrieval ------
get_train_locations <- function() {
  library(httr)
  library(jsonlite)
  library(dplyr)
  
  api_key <- Sys.getenv("CTA_API_KEY")
  routes  <- c("Red","Blue","Brn","G","Org","P","Pink","Y")
  all_obs <- list()
  
  for (rt in routes) {
    url      <- sprintf(
      "http://lapi.transitchicago.com/api/1.0/ttpositions.aspx?key=%s&rt=%s&outputType=JSON",
      api_key, rt
    )
    response <- GET(url)
    content  <- fromJSON(rawToChar(response$content), flatten = TRUE)
    
    # Case A: some endpoints return ctatt.train direct
    if (!is.null(content$ctatt$train)) {
      df <- content$ctatt$train
      df$rt <- rt
      all_obs[[length(all_obs) + 1]] <- df
      next
    }
    # Case B: nested under ctatt$route
    if (!is.null(content$ctatt$route)) {
      route_df  <- content$ctatt$route
      train_cols <- grep("train", names(route_df), value = TRUE)
      for (col in train_cols) {
        trains_list <- route_df[[col]]
        if (is.list(trains_list) && length(trains_list) > 0) {
          for (tr in trains_list) {
            if (is.null(tr)) next
            single <- as.data.frame(tr, stringsAsFactors = FALSE)
            single$rt <- rt
            all_obs[[length(all_obs) + 1]] <- single
          }
        }
      }
    }
  }
  if (length(all_obs) == 0) return(NULL)
  trains <- bind_rows(all_obs)
  trains <- trains %>%
    mutate(
      lat   = as.numeric(lat),
      lon   = as.numeric(lon),
      color = recode(rt,
                     Red = "red", Blue = "blue", Brn = "brown",
                     G = "green", Org = "orange", P = "purple",
                     Pink = "pink", Y = "yellow")
    )
  return(trains)
}

# ------ UI ------
ui <- dashboardPage(
  dashboardHeader(title = "Real-Time CTA Train Tracker"),
  dashboardSidebar(disable = TRUE),
  dashboardBody(
    fluidRow(
      box(width = 12, leafletOutput("trainMap", height = 600))
    )
  )
)

# ------ Server ------
server <- function(input, output, session) {
  output$trainMap <- renderLeaflet({
    leaflet() %>%
      setView(lng = -87.6298, lat = 41.8781, zoom = 11) %>%
      addProviderTiles(providers$CartoDB.Positron)
  })
  
  observe({
    invalidateLater(30000, session)
    trains <- get_train_locations()
    req(trains)
    leafletProxy("trainMap") %>%
      clearMarkers() %>%
      addCircleMarkers(
        data        = trains,
        lng         = ~lon,
        lat         = ~lat,
        color       = ~color,
        radius      = 8,
        stroke      = FALSE,
        fillOpacity = 0.8,
        popup       = ~paste0(
          "<strong>Line:</strong> ", rt, "<br>",
          "<strong>Heading:</strong> ", heading, "<br>",
          "<strong>Run #:</strong> ", rn
        )
      )
  })
}

# ------ Launch ------
shinyApp(ui, server)
