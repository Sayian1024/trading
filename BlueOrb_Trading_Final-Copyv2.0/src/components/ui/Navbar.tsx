import logo from "../../assets/logo.png";
const Navbar = () => {
  return (
    <nav className="">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center mt-5">
          <img src={logo} alt="Company Logo" className="h-20 w-auto" />
          <span className="text-xl font-semibold text-white">Blue Orb</span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
