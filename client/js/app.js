const menuGrid = document.getElementById("menuGrid"), cartList = document.getElementById("cartList"), totalEl = document.getElementById("total"), cartCount = document.getElementById("cartCount"), emptyCart = document.getElementById("emptyCart"), searchBox = document.getElementById("searchBox"), orderForm = document.getElementById("orderForm"), orderMessage = document.getElementById("orderMessage"), cartDrawer = document.getElementById("cartDrawer"), cartBackdrop = document.getElementById("cartBackdrop"), cartToggle = document.getElementById("cartToggle"), cartClose = document.getElementById("cartClose");

// Presentation metadata only: all order values and payloads remain API-driven.
const DISH_PRESENTATION = {
  1: {
    englishName: "Beef Pho",
    vietnameseName: "Phở bò",
    image: "assets/food/pho bo.jpg"
  },
  2: {
    englishName: "Brisket Pho",
    vietnameseName: "Phở gầu",
    image: "assets/food/pho gau.jpg"
  },
  3: {
    englishName: "Flank Pho",
    vietnameseName: "Phở nạm",
    image: "assets/food/pho nam.jpg"
  },
  4: {
    englishName: "Chicken Pho",
    vietnameseName: "Phở gà",
    image: "assets/food/pho ga.jpg"
  },
  5: {
    englishName: "Vietnamese Fried Dough",
    vietnameseName: "Quẩy",
    image: "assets/food/quay.jpg"
  },
  6: {
    englishName: "Poached Egg",
    vietnameseName: "Trứng trần",
    image: "assets/food/trung tran.jpg"
  },
  7: {
    englishName: "Vietnamese Iced Tea",
    vietnameseName: "Trà đá",
    image: "assets/food/tra da.jpg"
  },
  8: {
    englishName: "Soy Milk",
    vietnameseName: "Sữa đậu nành",
    image: "assets/food/sua dau.jpg"
  }
};
let cart = [], activeCategory = "", searchTimer;
const formatPrice = price => `${Number(price).toLocaleString()} VND`;
const presentationFor = item => DISH_PRESENTATION[item.id] || {englishName:item.name,vietnameseName:item.name,image:""};
const imageFor = item => String(item.image || presentationFor(item).image || "").trim();
async function loadMenu() { menuGrid.innerHTML = '<p class="menu-status">Preparing the menu…</p>'; const params = new URLSearchParams(); if(searchBox.value.trim()) params.set("search",searchBox.value.trim()); if(activeCategory) params.set("category",activeCategory); try { renderMenu(await apiGet(`/menu${params.toString() ? `?${params}` : ""}`)); } catch(err) { menuGrid.innerHTML = `<p class="menu-status is-error">Unable to load the menu. ${err.message}</p>`; } }
function renderMenu(menu) { menuGrid.innerHTML=""; if(!menu.length) { menuGrid.innerHTML='<p class="menu-status">No dishes match your search.</p>'; return; } menu.forEach(item => { const p=presentationFor(item), card=document.createElement("article"), imageWrap=document.createElement("div"), body=document.createElement("div"), source=imageFor(item); card.className="food-card"; imageWrap.className="food-image"; if(source) { const image=document.createElement("img"); image.src=source; image.alt=`${p.englishName} (${p.vietnameseName})`; image.loading="lazy"; image.addEventListener("error",()=>image.remove()); imageWrap.append(image); } const fallback=document.createElement("span"); fallback.className="image-fallback"; fallback.textContent=item.category === "drink" ? "◌" : "✦"; imageWrap.append(fallback); body.className="food-card-body"; const category=document.createElement("p"), title=document.createElement("h3"), vietnamese=document.createElement("p"), description=document.createElement("p"), footer=document.createElement("div"), price=document.createElement("strong"), add=document.createElement("button"); category.className="food-category"; category.textContent=item.category || "menu"; title.textContent=p.englishName; vietnamese.className="vietnamese-name"; vietnamese.textContent=p.vietnameseName; description.className="food-description"; description.textContent=item.description || "Prepared with care for your table."; footer.className="food-card-footer"; price.textContent=formatPrice(item.price); add.type="button"; add.className="add-button"; add.textContent=item.available === false ? "Unavailable" : "Add to order"; add.disabled=item.available === false; add.addEventListener("click",()=>{addToCart(item);openCart();}); footer.append(price,add); body.append(category,title,vietnamese,description,footer); card.append(imageWrap,body); menuGrid.append(card); }); }
function addToCart(item) { const existing=cart.find(cartItem=>cartItem.id===item.id); if(existing) existing.quantity+=1; else cart.push({id:item.id,name:item.name,price:item.price,quantity:1}); renderCart(); }
function changeQuantity(id,amount) { const item=cart.find(cartItem=>cartItem.id===id); if(!item)return; item.quantity+=amount; if(item.quantity<=0) cart=cart.filter(cartItem=>cartItem.id!==id); renderCart(); }
function renderCart() { cartList.innerHTML=""; const count=cart.reduce((sum,item)=>sum+item.quantity,0); cartCount.textContent=count; cartToggle.setAttribute("aria-label",`Your order, ${count} ${count===1?"item":"items"}`); emptyCart.hidden=Boolean(cart.length); cart.forEach(item=>{ const p=presentationFor(item),row=document.createElement("li"),text=document.createElement("div"),name=document.createElement("strong"),sub=document.createElement("span"),controls=document.createElement("div"); row.className="cart-item"; name.textContent=p.englishName; sub.textContent=`${formatPrice(item.price)} · ${formatPrice(item.price*item.quantity)}`; text.append(name,sub); controls.className="quantity-controls"; [["−","Decrease",-1],["+","Increase",1]].forEach(([symbol,label,amount])=>{const button=document.createElement("button");button.type="button";button.textContent=symbol;button.setAttribute("aria-label",`${label} ${p.englishName}`);button.addEventListener("click",()=>changeQuantity(item.id,amount));controls.append(button);if(amount===-1){const quantity=document.createElement("span");quantity.textContent=item.quantity;controls.append(quantity);}}); row.append(text,controls);cartList.append(row); }); totalEl.textContent=formatPrice(cart.reduce((sum,item)=>sum+item.price*item.quantity,0)); }
function openCart(){cartDrawer.classList.add("is-open");cartDrawer.setAttribute("aria-hidden","false");cartBackdrop.hidden=false;cartToggle.setAttribute("aria-expanded","true");cartClose.focus();}
function closeCart(){cartDrawer.classList.remove("is-open");cartDrawer.setAttribute("aria-hidden","true");cartBackdrop.hidden=true;cartToggle.setAttribute("aria-expanded","false");cartToggle.focus();}
document.querySelectorAll(".category-tab").forEach(button=>button.addEventListener("click",()=>{activeCategory=button.dataset.category;document.querySelectorAll(".category-tab").forEach(tab=>tab.classList.toggle("is-active",tab===button));loadMenu();})); searchBox.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(loadMenu,250);}); cartToggle.addEventListener("click",openCart);cartClose.addEventListener("click",closeCart);cartBackdrop.addEventListener("click",closeCart);document.addEventListener("keydown",event=>{if(event.key==="Escape"&&cartDrawer.classList.contains("is-open"))closeCart();});
orderForm.addEventListener("submit",async event=>{event.preventDefault();orderMessage.replaceChildren();const customerName=document.getElementById("customerName").value.trim(),tableNumber=document.getElementById("tableNumber").value.trim();if(!customerName||!cart.length){showOrderMessage(!customerName?"Please enter your name.":"Your cart is empty.","error");return;}try{const order=await apiPost("/orders",{customerName,tableNumber,items:cart});cart=[];renderCart();orderForm.reset();showOrderSuccess(order);}catch(err){showOrderMessage(`Unable to place the order: ${err.message}`,"error");}});
function showOrderMessage(message,type){const notice=document.createElement("p");notice.className=`message ${type}`;notice.textContent=message;orderMessage.replaceChildren(notice);}
function showOrderSuccess(order){const notice=document.createElement("p"),link=document.createElement("a");notice.className="message success";notice.textContent=`Order #${order.id} is confirmed. `;link.href=`Order_tracking.html?orderId=${encodeURIComponent(order.id)}`;link.textContent="Track my order";notice.append(link);orderMessage.replaceChildren(notice);}
loadMenu();
