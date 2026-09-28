workspace "Order service" "Order service architecture example" {
  model {
    customer = person "Customer" "Places and tracks orders."
    orderSystem = softwareSystem "Order System" "Accepts and processes customer orders." {
      web = container "Web App" "Order UI" "React"
      api = container "Order API" "Order endpoints" "Java"
      database = container "Order Database" "Stores orders" "PostgreSQL" {
        tags "Database"
      }
    }
    payment = softwareSystem "Payment Provider" "Processes payments." {
      tags "External"
    }
    customer -> web "Uses"
    web -> api "Submits orders" "HTTPS"
    api -> database "Reads and writes" "JDBC"
    api -> payment "Requests payment" "HTTPS"
  }
  views {
    systemContext orderSystem "OrderContext" "Order service context" {
      include *
      autoLayout
    }
    container orderSystem "OrderContainers" "Order service containers" {
      include *
      autoLayout
    }
    dynamic orderSystem "OrderFlow" "Order request flow" {
      customer -> web "Places an order"
      web -> api "Submits the order"
      api -> database "Stores the order"
      api -> payment "Authorizes payment"
      autoLayout
    }
    styles {
      element "Person" {
        shape person
      }
      element "Database" {
        shape cylinder
        background #438dd5
        color #ffffff
      }
      element "External" {
        background #999999
        color #ffffff
      }
    }
  }
}
