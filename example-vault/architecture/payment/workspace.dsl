workspace "Payment service" "Second workspace for note-level selection." {
  model {
    customer = person "Customer" "Makes a purchase."
    payment = softwareSystem "Payment Service" "Authorizes payments." {
      api = container "Payment API" "Payment endpoint" "Kotlin"
      store = container "Payment Store" "Payment records" "PostgreSQL"
    }
    provider = softwareSystem "Card Provider" "External card processing." {
      tags "External"
    }
    customer -> payment "Pays for an order"
    api -> provider "Authorizes card" "HTTPS"
    api -> store "Stores payment" "SQL"
  }
  views {
    systemContext payment "PaymentContext" "Payment context" {
      include *
      autoLayout
    }
    container payment "PaymentContainers" "Payment containers" {
      include *
      autoLayout
    }
    styles {
      element "Person" {
        shape person
      }
      element "External" {
        background #999999
        color #ffffff
      }
    }
  }
}
